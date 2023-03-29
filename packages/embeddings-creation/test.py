import unittest
import main
from unittest import mock
from unittest.mock import patch

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


def createScrapedFile(_, __, ___):
    with open(scraped_file_name, "w") as f:
        f.write(scrapedFileMock)


class TestEmbeddingsCreation(unittest.TestCase):
    @patch('openai.Embedding.create')
    @patch('main.download_from_bucket_to_path')
    @mock.patch.dict(
        "os.environ",
        {"GCP_STORAGE_SCRAPED_FILE_NAME": scraped_file_name, "GCP_STORAGE_EMBEDDING_FILE_NAME": embeddings_file_name},
        clear=True,
    )
    def test_embeddings_creations(self, download_from_bucket_to_path_mock, openai_Embedding_create_mock):
        openai_Embedding_create_mock.return_value=openAIEmbeddingsResponseMock

        download_from_bucket_to_path_mock.side_effect = createScrapedFile

        cloud_event = CloudEventMock()
        main.create_embeddings(cloud_event)
        
        with open(embeddings_file_name, 'r') as f:
          actualEmbeddings = f.read()
          expectedEmbeddings = ",text,n_tokens,embeddings\n0,Page content,2,[-0.010027382522821426]\n"
          self.assertEqual(actualEmbeddings, expectedEmbeddings)


if __name__ == "__main__":
    unittest.main()
