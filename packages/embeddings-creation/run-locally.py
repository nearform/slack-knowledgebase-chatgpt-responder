import os
from dotenv import load_dotenv
from main import create_embeddings

load_dotenv()

scraped_file_name = os.environ.get("GCP_STORAGE_SCRAPED_FILE_NAME")


class CloudEventMock:
    def __getitem__(self, i):
        return f"{i}"

    id = "event_id"
    type = "event_type"
    data = {
        "bucket": "bucket",
        "name": scraped_file_name,
        "metageneration": "metageneration",
        "timeCreated": "timeCreated",
        "updated": "updated",
    }

if __name__ == '__main__':
    scraped_file = os.environ.get("GCP_STORAGE_SCRAPED_FILE_NAME")
    cloud_event = CloudEventMock()
    create_embeddings(cloud_event)
