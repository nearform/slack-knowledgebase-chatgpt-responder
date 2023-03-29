import os
from google.cloud import storage
import shutil
import pathlib

def is_local_environment():
  #  @TODO Find an appropriate env var to tell prod environment
  return os.environ.get("FUNCTION_REGION") == None

current_directory = pathlib.Path(__file__).parent.resolve()
global_cache_folder = pathlib.Path(current_directory).parent.parent.resolve().joinpath('.cache')

def download_from_bucket_to_path(bucket_name, file_name, destination):
    if is_local_environment():
      shutil.copyfile(pathlib.Path(global_cache_folder).joinpath(file_name), destination)
    else:
      storage_client = storage.Client()
      bucket = storage_client.bucket(bucket_name)
      blob = bucket.blob(file_name)
      blob.download_to_filename(destination)
