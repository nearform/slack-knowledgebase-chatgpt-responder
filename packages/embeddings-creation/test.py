from google.cloud import storage
import unittest
import main
import openai
from unittest import mock
from unittest.mock import MagicMock, patch

scraped_file_name = "scraped.csv"
embeddings_file_name = "embeddings.csv"


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


scrapedFileMock = "index,title,text\n0,Title,Page content"
openAIEmbeddingsResponseMock = {
    "data": [
        {
            "embedding": [
                ## This is not real data
                -0.010027382522821426,
            ]
        }
    ]
}


def createScrapedFile(_):
    with open(scraped_file_name, "w") as f:
        f.write(scrapedFileMock)


class TesEmbeddingsCreation(unittest.TestCase):
    @patch("google.cloud.storage.Client")
    @mock.patch.dict(
        "os.environ",
        {"GCP_STORAGE_SCRAPED_FILE_NAME": scraped_file_name, "GCP_STORAGE_EMBEDDING_FILE_NAME": embeddings_file_name},
        clear=True,
    )
    def test_embeddings_creations(self, client_mock):
        openai.Embedding.create = MagicMock(return_value=openAIEmbeddingsResponseMock)

        # Create a mock bucket and blob
        bucket_mock = MagicMock()
        blob_mock = MagicMock()
        blob_mock.download_to_filename.side_effect = createScrapedFile

        client_mock.return_value.bucket.return_value = bucket_mock
        bucket_mock.blob.return_value = blob_mock

        cloud_event = CloudEventMock()
        main.create_embeddings(cloud_event)

        generatedEmbeddingsFile = open(embeddings_file_name, "r")
        actualEmbeddings = generatedEmbeddingsFile.read()
        expectedEmbeddings = ",text,n_tokens,embeddings\n0,Page content,2,[-0.010027382522821426]\n"
        self.assertEqual(actualEmbeddings, expectedEmbeddings)


if __name__ == "__main__":
    unittest.main()
