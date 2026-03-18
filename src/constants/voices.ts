export interface Voice {
  id: string;
  name: string;
  region: string;
}

export const voices: Voice[] = [
  { id: "DODLEQrClDo8wCz460ld", name: "Mima US-1", region: "English US" },
  { id: "L0yTtpRXzdyzQlzALhgD", name: "Mima US-2", region: "English US" },
  { id: "d3MFdIuCfbAIwiu7jC4a", name: "Mima US-3", region: "English US" },
  { id: "l4Coq6695JDX9xtLqXDE", name: "Mima US-4", region: "English US" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Mima UK-1", region: "English UK" },
  { id: "FGY2WhTYpP6BYn95boSj", name: "Mima UK-2", region: "English UK" },
  { id: "IKne3meq5a9ay67vC7pY", name: "Mima UK-3", region: "English UK" },
  { id: "YSabzCJMvEHDduIDMdwV", name: "Mima FI-1", region: "Finland" },
  { id: "c4ZwDxrFaobUF5e1KlEM", name: "Mima FI-2", region: "Finland" },
  { id: "RiWFFlzYFZuu4lPMig3i", name: "Mima FI-3", region: "Finland" },
  { id: "cLAH1kXlkAivJHxCW601", name: "Mima SE-1", region: "Sweden" },
  { id: "HqmZnnvy6tCQd8EGWKRT", name: "Mima SE-2", region: "Sweden" },
  { id: "1Iztu4UHnTb9SUjJcpS1", name: "Mima SE-3", region: "Sweden" },
  { id: "CaJslL1xziwefCeTNzHv", name: "Mima ES-1", region: "Spanish" },
  { id: "m7yTemJqdIqrcNleANfX", name: "Mima ES-2", region: "Spanish" },
  { id: "qBvury71WUJfVeT1STkG", name: "Mima ES-3", region: "Spanish" },
];

export const DEFAULT_VOICE_ID = voices[0].id;
