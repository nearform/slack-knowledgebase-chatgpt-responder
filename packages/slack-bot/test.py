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

    @patch("openai.Embedding.create")
    @patch("openai.ChatCompletion.create")
    def test_answer(self, openai_ChatCompletion_create_mock, openai_Embedding_create_mock):
        import main

        openai_Embedding_create_mock.return_value = openAIEmbeddingsResponseMock
        openai_ChatCompletion_create_mock.return_value = openAICompletionResponseMock
        say_mock = MagicMock()

        event = {"channel_type": "im", "text": "What is nearform?"}
        main.handle_message(event, say_mock)
        expected = openAICompletionResponseMock["choices"][0]["message"]["content"]
        say_mock.assert_called_with(expected)

    @patch("knowledge_base.get_answer")
    def test_rate_limit_error_answer(self, get_answer_mock):
        import main

        say_mock = MagicMock()

        event = {"channel_type": "im", "text": "hello!"}
        get_answer_mock.side_effect = RateLimitError()
        main.handle_message(event, say_mock)
        say_mock.assert_called_with("I'm having a :coffee:, I'll be back later")


if __name__ == "__main__":
    unittest.main()
