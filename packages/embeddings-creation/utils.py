import os
from google.cloud import storage
import shutil
import pathlib


def is_local_environment():
    #  @TODO Find an appropriate env var to tell prod environment
    return os.environ.get("FUNCTION_REGION") == None


current_directory = pathlib.Path(__file__).parent.resolve()
global_cache_folder = pathlib.Path(current_directory).parent.parent.resolve().joinpath(".cache")


def download(bucket_name, file_name, destination):
    if is_local_environment():
        shutil.copyfile(pathlib.Path(global_cache_folder).joinpath(file_name), destination)
    else:
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(file_name)
        blob.download_to_filename(destination)
        print("Downloaded storage object {} from bucket {} to local file {}.".format(file_name, bucket, destination))


def upload(bucket_name, source_file_path):
    if is_local_environment():
        shutil.copyfile(source_file_path, pathlib.Path(global_cache_folder).joinpath(source_file_path))
    else:
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(source_file_path)
        blob.upload_from_filename(source_file_path, if_generation_match=None)
