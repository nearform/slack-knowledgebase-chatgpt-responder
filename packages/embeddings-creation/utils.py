import os
from google.cloud import storage


def is_local_environment():
  #  @TODO Find an appropriate env var to tell prod environment
  return os.environ.get("FUNCTION_REGION") == None


def download_from_bucket_to_path(bucket_name, file_name, destination):
    storage_client = storage.Client()
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(file_name)
    blob.download_to_filename(destination)

def upload_from_path_to_bucket(bucket_name, source_file_path):
    storage_client = storage.Client()
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(source_file_path)
    blob.upload_from_filename(source_file_path, if_generation_match=None)
