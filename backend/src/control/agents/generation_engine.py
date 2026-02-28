from langchain_openai import ChatOpenAI
from tavily import TavilyClient
import os
from langchain_core.messages import HumanMessage, SystemMessage
from dotenv import load_dotenv

load_dotenv()

llm = ChatOpenAI(
        base_url="https://fyra.im/v1",
        api_key=os.getenv("OPENAI_API_KEY"),
        model = "gpt-oss-20b"
    )

async def _llm(system: str, user: str) -> str:
    return llm.invoke([SystemMessage(content=system),
                       HumanMessage(content=user)]).content.strip()


def _tavily():
    return TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))