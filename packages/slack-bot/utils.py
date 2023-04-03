import os
from google.cloud import storage
import shutil
from walk_up import walk_up_until

def is_local_environment():
    #  @TODO Find an appropriate env var to tell prod environment
    return os.environ.get("FUNCTION_REGION") == None

if is_local_environment():
  rootPackage = walk_up_until("package.json")
  rootDir = os.path.dirname(rootPackage)
  rootCache = os.path.join(rootDir, '.cache') 


def download(bucket_name, file_name, destination):
    if is_local_environment():
      shutil.copyfile(os.path.join(rootCache, file_name), destination)
      return

    storage_client = storage.Client()
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(file_name)
    blob.download_to_filename(destination)
