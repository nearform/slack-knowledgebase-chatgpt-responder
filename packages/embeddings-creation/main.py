# Example of message received from notification
#
#   {
#    "attributes":{
#       "specversion":"1.0",
#       "id":"123451234512345",
#       "source":"//storage.googleapis.com/projects/_/buckets/MY-BUCKET-NAME",
#       "type":"google.cloud.storage.object.v1.finalized",
#       "datacontenttype":"application/json",
#       "subject":"objects/MY_FILE.txt",
#       "time":"2020-01-02T12:34:56.789Z"
#    },
#    "data":{
#       "bucket":"MY_BUCKET",
#       "contentType":"text/plain",
#       "kind":"storage#object",
#       "md5Hash":"...",
#       "metageneration":"1",
#       "name":"MY_FILE.txt",
#       "size":"352",
#       "storageClass":"MULTI_REGIONAL",
#       "timeCreated":"2020-04-23T07:38:57.230Z",
#       "timeStorageClassUpdated":"2020-04-23T07:38:57.230Z",
#       "updated":"2020-04-23T07:38:57.230Z"
#    }
# }
#
# https://cloud.google.com/storage/docs/json_api/v1/objects#resource
# see https://github.com/GoogleCloudPlatform/python-docs-samples/blob/main/functions/v2/storage/main.py

import os
import functions_framework
from google.cloud import storage
import tiktoken
import pandas as pd
import openai
import backoff
import numpy as np

openai.api_key = os.environ.get("OPENAI_API_KEY")
tokenizer = tiktoken.get_encoding("cl100k_base")
max_tokens = 500
scraped_file = os.environ.get("GCP_STORAGE_FILE_NAME")
embeddings_file = os.environ.get("GCP_STORAGE_EMBEDDING_FILE_NAME")


# Triggered by a change in a storage bucket
@functions_framework.cloud_event
def create_embeddings(cloud_event):
    storage_client = storage.Client()

    data = cloud_event.data

    event_id = cloud_event["id"]
    event_type = cloud_event["type"]

    bucket = data["bucket"]
    name = data["name"]
    metageneration = data["metageneration"]
    timeCreated = data["timeCreated"]
    updated = data["updated"]

    print(f"Event ID: {event_id}")
    print(f"Event type: {event_type}")
    print(f"Bucket: {bucket}")
    print(f"File: {name}")
    print(f"Metageneration: {metageneration}")
    print(f"Created: {timeCreated}")
    print(f"Updated: {updated}")

    if name != scraped_file:
        print("Skipping processing of file {}".format(name))
        return

    bucket = storage_client.bucket(bucket)

    blob = bucket.blob(name)
    blob.download_to_filename(scraped_file)

    df = pd.read_csv(scraped_file, index_col=0)
    df.columns = ["title", "text"]

    # Tokenize the text and save the number of tokens to a new column
    df["n_tokens"] = df.text.apply(lambda x: len(tokenizer.encode(x)))

    print("Downloaded storage object {} from bucket {} to local file {}.".format(name, bucket, scraped_file))

    shortened = []

    # Loop through the dataframe
    for row in df.iterrows():
        # If the text is None, go to the next row
        if row[1]["text"] is None:
            continue

        # If the number of tokens is greater than the max number of tokens, split the text into chunks
        if row[1]["n_tokens"] > max_tokens:
            shortened += split_into_many(row[1]["text"])

        # Otherwise, add the text to the list of shortened texts
        else:
            shortened.append(row[1]["text"])

    df = pd.DataFrame(shortened, columns=["text"])
    df["n_tokens"] = df.text.apply(lambda x: len(tokenizer.encode(x)))

    df["embeddings"] = df.text.apply(
        lambda x: embeddings_with_backoff(input=x, engine="text-embedding-ada-002")["data"][0]["embedding"]
    )

    df.to_csv(embeddings_file)

    destination_blob = bucket.blob(embeddings_file)
    destination_blob.upload_from_filename(embeddings_file, if_generation_match=None)


# Function to split the text into chunks of a maximum number of tokens
def split_into_many(text, max_tokens=max_tokens):
    # Split the text into sentences
    sentences = text.split(". ")

    # Get the number of tokens for each sentence
    n_tokens = [len(tokenizer.encode(" " + sentence)) for sentence in sentences]

    chunks = []
    tokens_so_far = 0
    chunk = []

    # Loop through the sentences and tokens joined together in a tuple
    for sentence, token in zip(sentences, n_tokens):
        # If the number of tokens so far plus the number of tokens in the current sentence is greater
        # than the max number of tokens, then add the chunk to the list of chunks and reset
        # the chunk and tokens so far
        if tokens_so_far + token > max_tokens:
            chunks.append(". ".join(chunk) + ".")
            chunk = []
            tokens_so_far = 0

        # If the number of tokens in the current sentence is greater than the max number of
        # tokens, go to the next sentence
        if token > max_tokens:
            continue

        # Otherwise, add the sentence to the chunk and add the number of tokens to the total
        chunk.append(sentence)
        tokens_so_far += token + 1

    return chunks


@backoff.on_exception(backoff.expo, openai.error.RateLimitError)
def embeddings_with_backoff(**kwargs):
    return openai.Embedding.create(**kwargs)
