import unittest
from unittest.mock import MagicMock
import openai
import logging

from knowledge_base import get_answer

# @TODO We need to properly mock "openai.Embedding.create" return value
openAIEmbeddingsResponseMock = [0, 0, 0, 0, 0]

openAICompletionResponseMock = {
    "choices": [
        {
            "finish_reason": "stop",
            "index": 0,
            "text": "Answer mock",
        }
    ],
    "created": 1679331374,
    "id": "cmpl-6wD5q1SmC6Pqc3AiMFRUYCDrAU3vE",
    "model": "text-davinci-003",
    "object": "text_completion",
    "usage": {"completion_tokens": 65, "prompt_tokens": 1538, "total_tokens": 1603},
}


class TestAnswer(unittest.TestCase):
    def test_answer(self):
        openai.Embedding.create = MagicMock(return_value=openAIEmbeddingsResponseMock)
        openai.Completion.create = MagicMock(return_value=openAICompletionResponseMock)

        actual = get_answer("What is nearform?")
        expected = openAICompletionResponseMock["choices"][0]["text"]
        self.assertEqual(actual, expected)


if __name__ == "__main__":
    unittest.main()
