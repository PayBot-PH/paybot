"""
Enhanced Enum classes with automatic type conversion support.
This module provides base enum classes that automatically convert to their string values
when used in contexts that expect strings, eliminating the need for .value calls.
"""

from enum import Enum
from typing import Any


class AutoStrEnum(str, Enum):
    """
    Enhanced string enum that automatically converts to string value.

    This enum automatically returns its string value when used in contexts
    that expect strings, eliminating the need for .value calls.

    Example:
        class Status(AutoStrEnum):
            PENDING = "pending"
            COMPLETED = "completed"

        # These are equivalent:
        status = Status.PENDING
        print(status)  # "pending" (no .value needed)
        db_column = Column(String(20), default=Status.PENDING)  # Works directly
    """

    def __str__(self) -> str:
        """Return the string value of the enum."""
        return self.value

    def __repr__(self) -> str:
        """Return a string representation of the enum."""
        return f"{self.__class__.__name__}.{self.name}"

    @classmethod
    def _missing_(cls, value: Any) -> Any:
        """
        Handle missing enum values by trying to match against string values.
        This allows for more flexible enum creation from strings.
        """
        if isinstance(value, str):
            for member in cls:
                if member.value == value:
                    return member
        return None


class AutoIntEnum(int, Enum):
    """
    Enhanced integer enum that automatically converts to integer value.

    This enum automatically returns its integer value when used in contexts
    that expect integers, eliminating the need for .value calls.

    Example:
        class Priority(AutoIntEnum):
            LOW = 1
            HIGH = 2

        # These are equivalent:
        priority = Priority.HIGH
        print(priority)  # 2 (no .value needed)
        db_column = Column(Integer, default=Priority.HIGH)  # Works directly
    """

    def __str__(self) -> str:
        """Return the string representation of the integer value."""
        return str(self.value)

    def __repr__(self) -> str:
        """Return a string representation of the enum."""
        return f"{self.__class__.__name__}.{self.name}"

    @classmethod
    def _missing_(cls, value: Any) -> Any:
        """
        Handle missing enum values by trying to match against integer values.
        This allows for more flexible enum creation from integers.
        """
        if isinstance(value, int):
            for member in cls:
                if member.value == value:
                    return member
        return None
