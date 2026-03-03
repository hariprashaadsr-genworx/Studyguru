from langchain_openai import ChatOpenAI
from tavily import TavilyClient
from langchain_core.messages import HumanMessage, SystemMessage
from src.config.settings import settings
import asyncio
from openai import RateLimitError

_llm_semaphore = asyncio.Semaphore(2)

llm = ChatOpenAI(
        base_url="https://fyra.im/v1",
        api_key=settings.OPENAI_API_KEY,
        model = "gpt-oss-20b"
    )

async def _llm(system: str, user: str) -> str:
    async with _llm_semaphore:  
        for attempt in range(3):
            try:
                response = await llm.ainvoke([
                    SystemMessage(content=system),
                    HumanMessage(content=user)
                ])
                return response.content.strip()

            except RateLimitError:
                if attempt == 2:
                    raise
                await asyncio.sleep(2 ** attempt)  
                
def _tavily():
    return TavilyClient(api_key=settings.TAVILY_API_KEY)