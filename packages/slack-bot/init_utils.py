import pandas as pd
import numpy as np


def get_mock_embeddings_file(path):
    embeddingsFileMock = (
        ",text,n_tokens,embeddings\n"
        '0,"NearForm is a software development company.",500,"[0.017733527347445488, -0.01051256712526083, -0.004159081261605024, -0.037195149809122086, -0.029185574501752853]"'
    )

    with open("./.cache/embeddings.csv", "w") as f:
        f.write(embeddingsFileMock)

    df = pd.read_csv(path, index_col=0)

    df["embeddings"] = df["embeddings"].apply(eval).apply(np.array)

    return df
