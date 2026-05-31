import asyncio
from core.database import db_manager
from models.pos_terminal import POSTerminalDevice, POSTerminal
from sqlalchemy import select

async def check_db():
    await db_manager.init_db()
    async with db_manager.async_session_maker() as session:
        # Check devices
        res = await session.execute(select(POSTerminalDevice))
        devices = res.scalars().all()
        print(f"Total devices: {len(devices)}")
        for d in devices:
            print(f"Device: {d.device_id}, Authorized: {d.is_authorized}, Model: {d.model}")
            
        # Check terminals
        res = await session.execute(select(POSTerminal))
        terminals = res.scalars().all()
        print(f"Total terminals: {len(terminals)}")
        for t in terminals:
            print(f"Terminal: {t.terminal_code}, User: {t.user_id}, Active: {t.is_active}")

if __name__ == "__main__":
    asyncio.run(check_db())
