from dataclasses import dataclass, field, asdict

@dataclass
class Result:
    category: str
    name: str
    status: str
    summary: str = ""
    details: list[str] = field(default_factory=list)
    count: int = 0
    duration: float = 0.0
    severity: str = "normal"

    def to_dict(self):
        return asdict(self)
