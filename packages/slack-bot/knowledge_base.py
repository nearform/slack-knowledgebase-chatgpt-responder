import pandas as pd
import numpy as np
import openai
from openai.embeddings_utils import distances_from_embeddings, cosine_similarity
import os
from dotenv import load_dotenv
from google.cloud import storage, pubsub_v1

load_dotenv()  # take environment variables from .env.

openai.api_key = os.environ.get("OPENAI_API_KEY")
project_name = os.environ.get("GCP_PROJECT_NAME")
bucket_name = os.environ.get("GCP_STORAGE_BUCKET_NAME")
bucket_embeddings_file = os.environ.get("GCP_STORAGE_EMBEDDING_FILE_NAME")
embeddings_subscription = os.environ.get("GCP_EMBEDDING_SUBSCRIPTION")
local_embeddings_file = ".cache/embeddings.csv"


def make_cache_folder():
    if not os.path.exists(".cache"):
        os.makedirs(".cache")


def download_csv_from_bucket_to_path(bucket_name, file_name, destination):
    # Instantiates a client
    storage_client = storage.Client()

    # Gets the bucket
    bucket = storage_client.bucket(bucket_name)

    # Gets the blob (file)
    blob = bucket.blob(file_name)

    # Downloads the file to path
    blob.download_to_filename(destination)


# Most of the code taken from:
# https://github.com/openai/openai-cookbook/tree/main/apps/web-crawl-q-and-a
def get_embeddings_file():
    download_csv_from_bucket_to_path(bucket_name, bucket_embeddings_file, local_embeddings_file)
    df = pd.read_csv(local_embeddings_file, index_col=0)
    df["embeddings"] = df["embeddings"].apply(eval).apply(np.array)

    return df


def subscribe_to_embedding_changes():
    subscriber = pubsub_v1.SubscriberClient()

    def callback(message):
        global df
        if (
            message.attributes["objectId"] == bucket_embeddings_file
            and message.attributes["eventType"] == "OBJECT_FINALIZE"
        ):
            df = get_embeddings_file()

        message.ack()

    subscriber.subscribe(f"projects/{project_name}/subscriptions/{embeddings_subscription}", callback)


def create_context(question, df, max_len=1800, size="ada"):
    """
    Create a context for a question by finding the most similar context from the dataframe
    """

    # Get the embeddings for the question
    q_embeddings = openai.Embedding.create(input=question, engine="text-embedding-ada-002")["data"][0]["embedding"]

    # Get the distances from the embeddings
    df["distances"] = distances_from_embeddings(q_embeddings, df["embeddings"].values, distance_metric="cosine")

    returns = []
    cur_len = 0

    # Sort by distance and add the text to the context until the context is too long
    for i, row in df.sort_values("distances", ascending=True).iterrows():
        # Add the length of the text to the current length
        cur_len += row["n_tokens"] + 4

        # If the context is too long, break
        if cur_len > max_len:
            break

        # Else add it to the text that is being returned
        returns.append(row["text"])

    # Return the context
    return "\n\n###\n\n".join(returns)


def answer_question(
    df,
    model="text-davinci-003",
    question="Am I allowed to publish model outputs to Twitter, without a human review?",
    max_len=1800,
    size="ada",
    debug=False,
    max_tokens=150,
    stop_sequence=None,
):
    """
    Answer a question based on the most similar context from the dataframe texts
    """
    context = create_context(
        question,
        df,
        max_len=max_len,
        size=size,
    )
    # If debug, print the raw model response
    if debug:
        print("Context:\n" + context)
        print("\n\n")

    try:
        # Create a completions using the question and context
        response = openai.Completion.create(
            prompt=f"Answer the question based on the context below, and if the question can't be answered based on the context, say \"I don't know\"\n\nContext: {context}\n\n---\n\nQuestion: {question}\nAnswer:",
            temperature=0,
            max_tokens=max_tokens,
            top_p=1,
            frequency_penalty=0,
            presence_penalty=0,
            stop=stop_sequence,
            model=model,
        )
        return response["choices"][0]["text"].strip()
    except Exception as e:
        print(e)
        return ""


def get_answer(question):
    return answer_question(df, question=question, debug=True)


make_cache_folder()
df = get_embeddings_file()
subscribe_to_embedding_changes()
