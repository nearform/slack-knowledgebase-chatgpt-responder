import unittest
from unittest.mock import MagicMock, patch

import openai
from openai.error import RateLimitError
import slack_bolt as slack_bolt

slack_bolt.App = MagicMock()


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


class TestAnswer(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # Set up the environment variables mock
        cls.env_patch = patch.dict(
          "os.environ",
          {"GCP_STORAGE_EMBEDDING_FILE_NAME": "embeddings.csv"},
          clear=True,
        )
        cls.env_patch.start()

    def test_answer(self):
        import main
        openai.Embedding.create = MagicMock(return_value=openAIEmbeddingsResponseMock)
        openai.ChatCompletion.create = MagicMock(return_value=openAICompletionResponseMock)
        say_mock = MagicMock()

        event = {"channel_type": "im", "text": "What is nearform?"}
        main.handle_message(event, say_mock)
        expected = openAICompletionResponseMock["choices"][0]["message"]["content"]
        say_mock.assert_called_with(expected)

    def test_rate_limit_error_answer(self):
        import main
        import knowledge_base
        openai.Embedding.create = MagicMock(return_value=openAIEmbeddingsResponseMock)
        openai.ChatCompletion.create = MagicMock(side_effect=openAICompletionResponseMock)
        say_mock = MagicMock()

        event = {"channel_type": "im", "text": "hello!"}
        knowledge_base.get_answer = MagicMock(side_effect=RateLimitError())
        main.handle_message(event, say_mock)
        say_mock.assert_called_with("I'm having a :coffee:, I'll be back later")



if __name__ == "__main__":
    unittest.main()
