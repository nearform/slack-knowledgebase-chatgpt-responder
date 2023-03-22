import unittest
from unittest.mock import MagicMock
import openai
from google.cloud import storage


# Google cloud storage mocks
class GoogleCloudStorageMock:
    def bucket(bucket_name, _):
        return GoogleCloudBucketMock()


class GoogleCloudBucketMock:
    def blob(file_name, _):
        return GoogleCloudBlobMock()


class GoogleCloudBlobMock:
    def download_to_filename(destination, _):
        return


storage.Client = MagicMock(return_value=GoogleCloudStorageMock())


# OPEN AI mocks
openAIEmbeddingsResponseMock = {
    "data": [
        {
            "embedding": [
                ## This is not real data
                -0.010027382522821426,
                -0.007285463623702526,
                -0.009962782263755798,
                0.0008478772360831499,
                -0.0076012867502868176,
            ]
        }
    ]
}

openAICompletionResponseMock = {
    "choices": [{"message": {"content": "Answer mock"}}],
}

embeddingsFileMock = (
    ",text,n_tokens,embeddings\n"
    '0,"NearForm is a software development company.",500,"[0.017733527347445488, -0.01051256712526083, -0.004159081261605024, -0.037195149809122086, -0.029185574501752853]"'
)

# Create .cache/embeddings.csv mock
with open("./.cache/embeddings.csv", "w") as f:
    f.write(embeddingsFileMock)

# Imported here since we need to mock dependencies before module execution
import knowledge_base as knowledge_base


class TestAnswer(unittest.TestCase):
    def test_answer(self):
        openai.Embedding.create = MagicMock(return_value=openAIEmbeddingsResponseMock)
        openai.ChatCompletion.create = MagicMock(return_value=openAICompletionResponseMock)

        actual = knowledge_base.get_answer("What is nearform?")
        expected = openAICompletionResponseMock["choices"][0]["message"]["content"]
        self.assertEqual(actual, expected)


if __name__ == "__main__":
    unittest.main()
