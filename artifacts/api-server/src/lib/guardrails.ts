import type { GroundedAnswerClaim, RetrievedChunk } from "./llm";

export type GuardrailResult = {
  responseText: string;
  actions: string[];
  blocked: boolean;
};

export function applyGuardrails(
  responseText: string,
  input: {
    retrievedChunks: RetrievedChunk[];
    personAttributes: Record<string, unknown>;
    hasAuthorizedLiveData?: boolean;
    authorizedLiveData?: {
      clientName: string;
      facts: Record<string, string | number | boolean>;
    };
    groundedClaims?: GroundedAnswerClaim[];
  },
): GuardrailResult {
  const actions: string[] = [];
  if (input.retrievedChunks.length === 0 && !input.hasAuthorizedLiveData) {
    return {
      responseText,
      actions: ["grounding_required"],
      blocked: true,
    };
  }

  let guarded = responseText;
  if (input.retrievedChunks.length > 0) {
    const claims = input.groundedClaims ?? [];
    const supportedClaims = resolveSupportedClaims(
      claims,
      input.retrievedChunks,
    );
    if (supportedClaims.length === 0) {
      return {
        responseText,
        actions: ["grounded_claims_required"],
        blocked: true,
      };
    }
    if (supportedClaims.length < claims.length) {
      actions.push("unsupported_claims_removed");
    }
    guarded = renderGroundedClaims(supportedClaims);
  } else if (input.hasAuthorizedLiveData && input.authorizedLiveData) {
    const claims = input.groundedClaims ?? [];
    const supportedClaims = claims.filter((claim) =>
      isClaimSupportedByLiveData(claim, input.authorizedLiveData!),
    );
    if (supportedClaims.length === 0) {
      return {
        responseText,
        actions: ["live_data_claims_required"],
        blocked: true,
      };
    }
    if (supportedClaims.length < claims.length) {
      actions.push("unsupported_claims_removed");
    }
    guarded = renderGroundedClaims(supportedClaims);
  }

  for (const value of Object.values(input.personAttributes)) {
    if (typeof value !== "string" || value.length < 4) continue;
    if (!guarded.toLowerCase().includes(value.toLowerCase())) continue;
    guarded = guarded.replaceAll(value, "[redacted]");
    actions.push("personal_data_redacted");
  }

  return {
    responseText: guarded,
    actions: [...new Set(actions)],
    blocked: false,
  };
}

const CONTROL_TERM_GROUPS = [
  ["button", "boton"],
  ["option", "opcion"],
  ["menu"],
  ["tab", "pestana"],
  ["dropdown", "desplegable"],
  ["field", "campo"],
  ["section", "seccion"],
  ["setting", "settings", "ajuste", "configuracion"],
  ["toggle", "alternador"],
  ["link", "enlace"],
  ["form", "formulario"],
];

const NON_CONTENT_WORDS = new Set([
  "about", "after", "all", "also", "and", "are", "as", "at", "be", "been",
  "before", "being", "but", "by", "can", "could", "do", "does", "for", "from",
  "had", "has", "have", "he", "her", "here", "him", "his", "how", "i", "if",
  "in", "into", "is", "it", "its", "me", "my", "of", "on", "or", "our", "out",
  "she", "should", "so", "that", "the", "their", "them", "there", "these",
  "they", "this", "those", "through", "to", "up", "us", "was", "we", "were",
  "what", "when", "where", "which", "who", "why", "will", "with", "would",
  "you", "your", "a", "al", "algo", "como", "con", "cual", "de", "del", "donde",
  "e", "el", "ella", "ellas", "ellos", "en", "entre", "era", "es", "esa",
  "esas", "ese", "eso", "esos", "esta", "estas", "este", "esto", "estos",
  "fue", "ha", "hace", "hacia", "han", "hasta", "hay", "la", "las", "le",
  "les", "lo", "los", "mas", "me", "mi", "mis", "muy", "no", "o", "para",
  "pero", "por", "porque", "que", "se", "si", "sin", "sobre", "su", "sus",
  "tambien", "te", "tiene", "tu", "tus", "un", "una", "unas", "uno", "unos",
  "y", "ya", "puede", "puedes", "pueden",
]);

const EXAMPLE_MARKERS = [
  "for example",
  "such as",
  "e g",
  "por ejemplo",
  "como por ejemplo",
];

const ACTION_VERB_GROUPS = [
  ["open", "opens", "opening", "abre", "abrir", "abres", "abra"],
  [
    "find", "finds", "finding", "found", "locate", "locates", "localiza",
    "localizar", "localizas", "encuentra", "encontrar", "encuentras",
  ],
  ["go", "goes", "going", "went", "ve", "ir", "accede", "acceder"],
  ["look", "looks", "looking", "mira", "mirar", "busca", "buscar", "search"],
  ["click", "clicks", "clic", "pulsa", "pulse"],
  ["select", "selects", "selecciona", "seleccionar"],
  ["choose", "chooses", "elige", "elegir"],
  ["contact", "contacts", "contacta", "contactar", "reach"],
  ["call", "calls", "calling", "llama", "llamar", "llame", "marca", "marcar"],
  ["request", "requests", "solicita", "solicitar", "pide", "pedir"],
  ["use", "uses", "using", "usa", "usar", "utiliza", "utilizar"],
  ["login", "log", "inicia", "iniciar", "sign"],
  ["enter", "enters", "introduce", "introducir", "ingresa", "ingresar"],
  ["check", "checks", "comprueba", "comprobar", "revisa", "revisar"],
  ["send", "sends", "envia", "enviar"],
  ["write", "writes", "escribe", "escribir"],
  ["visit", "visits", "visita", "visitar"],
];

const CONTROL_REFERENCE_ACTIONS = new Set([
  "click", "clicks", "clic", "haz", "press", "pulsa", "open", "opens",
  "abre", "abrir", "go", "ve", "find", "locate", "localiza", "encuentra",
  "select", "selecciona", "choose", "elige", "visit", "visita", "see",
  "view", "ver", "consult", "consultar",
]);

const CONTROL_REFERENCE_DECORATORS = new Set([
  "green", "verde", "blue", "azul", "primary", "secondary", "principal",
]);

const CONTROL_DESTINATION_TRANSLATIONS = [
  ["account", "accounts", "cuenta", "cuentas"],
  ["setting", "settings", "ajuste", "ajustes", "configuracion", "configuraciones"],
  ["cancel", "cancelar", "cancelacion"],
  ["service", "servicio"],
  ["section", "seccion"],
  ["button", "boton"],
  ["option", "opcion"],
  ["field", "campo"],
  ["tab", "pestana"],
  ["add", "añade", "anadir"],
  ["client", "cliente", "clientes"],
];

const CONTACT_CHANNEL_GROUPS = [
  ["phone", "telephone", "telefono", "phone number", "telephone number", "numero de telefono"],
  ["email", "mail", "e mail", "correo"],
  ["whatsapp"],
  ["slack"],
  ["telegram"],
  ["sms", "text message", "mensaje de texto"],
  ["chat", "live chat", "chat en vivo"],
  ["discord"],
  ["zoom"],
  ["microsoft teams", "teams"],
];

const CONTACT_METHOD_PREPOSITIONS = [
  "via", "by", "through", "using", "on", "por", "mediante", "a traves de",
  "por medio de",
];

const QUOTED_SPEECH_MARKERS =
  /\b(?:say|tell|write|type|message|phrase|ask them|use this phrase|di|dile|diles|decir|escribe|escribir|mensaje|frase|usa esta frase|puedes usar)\b/;

export function isClaimSupportedByEvidence(
  claim: GroundedAnswerClaim,
  chunks: RetrievedChunk[],
): boolean {
  const text = claim.text.trim();
  const evidence = claim.evidenceQuote.trim();
  if (!text || !evidence || evidence.length > 500) return false;
  if (
    claim.citationIndex === null ||
    !Number.isInteger(claim.citationIndex) ||
    claim.citationIndex < 1
  ) {
    return false;
  }

  const chunk = chunks[claim.citationIndex - 1];
  if (!chunk) return false;
  const evidenceText = [
    chunk.content,
    ...(chunk.assets ?? []).map((asset) => asset.altText),
  ].join("\n");
  const normalizedEvidence = normalizeText(evidence);
  if (!normalizedEvidence || !normalizeText(evidenceText).includes(normalizedEvidence)) {
    return false;
  }

  const claimTokens = contentTokens(text);
  const evidenceTokens = new Set(contentTokens(evidence).map(comparableToken));
  const matches = claimTokens.filter((token) =>
    evidenceTokens.has(comparableToken(token)),
  );
  const weakLexicalMatch =
    claimTokens.length > 0 &&
    (matches.length < Math.min(2, claimTokens.length) ||
      matches.length / claimTokens.length < 0.4);
  if (weakLexicalMatch && !hasLikelyLanguageTranslation(text, evidence)) {
    return false;
  }

  const evidenceWords = new Set(normalizeText(evidence).split(" "));
  const claimWords = normalizeText(text).split(" ");
  if (
    claimWords.some(
      (word) =>
        CONTROL_TERM_GROUPS.some(
          (group) =>
            group.includes(word) &&
            ![...evidenceWords].some((evidenceWord) =>
              group.includes(evidenceWord),
            ),
        ),
    )
  ) {
    return false;
  }
  if (
    !areControlDestinationsSupported(text, evidence) ||
    !areContactChannelsSupported(text, evidence)
  ) {
    return false;
  }

  const normalizedClaim = normalizeText(text);
  if (
    EXAMPLE_MARKERS.some((marker) => normalizedClaim.includes(marker)) &&
    !EXAMPLE_MARKERS.some((marker) => normalizeText(evidence).includes(marker))
  ) {
    return false;
  }

  const quotedPhrases = [...text.matchAll(/["“”«»]([^"“”«»]+)["“”«»]/g)]
    .map((match) => normalizeText(match[1] ?? ""))
    .filter(Boolean);
  if (
    quotedPhrases.some((phrase) => !normalizeText(evidence).includes(phrase))
  ) {
    return false;
  }
  const claimHasControl = claimWords.some((word) =>
    CONTROL_TERM_GROUPS.some((group) => group.includes(word)),
  );
  if (
    quotedPhrases.length > 0 &&
    !(
      (claimHasControl &&
        claimWords.some((word) =>
          CONTROL_TERM_GROUPS.some(
            (group) =>
              group.includes(word) &&
              [...evidenceWords].some((evidenceWord) => group.includes(evidenceWord)),
          ),
        )) ||
      (QUOTED_SPEECH_MARKERS.test(normalizedClaim) &&
        QUOTED_SPEECH_MARKERS.test(normalizedEvidence))
    )
  ) {
    return false;
  }

  const claimNumbers = text.match(/\d+(?:[.,]\d+)*/g) ?? [];
  const evidenceNumbers = new Set(evidence.match(/\d+(?:[.,]\d+)*/g) ?? []);
  if (claimNumbers.some((number) => !evidenceNumbers.has(number))) {
    return false;
  }

  return (
    areControlDestinationsSupported(text, evidence) &&
    areContactChannelsSupported(text, evidence)
  );
}

function areControlDestinationsSupported(
  text: string,
  evidence: string,
): boolean {
  const claimReferences = getControlReferences(text);
  if (claimReferences.length === 0) return true;
  const evidenceReferences = getControlReferences(evidence);
  return claimReferences.every((claimReference) =>
    evidenceReferences.some((evidenceReference) => {
      if (
        !claimReference.typeGroup.some((term) =>
          evidenceReference.typeGroup.includes(term),
        )
      ) {
        return false;
      }
      return claimReference.destinationTokens.every((token) =>
        evidenceReference.destinationTokens.some((evidenceToken) =>
          areComparableControlDestinationTokens(token, evidenceToken),
        ),
      );
    }),
  );
}

function getControlReferences(
  value: string,
): Array<{ typeGroup: string[]; destinationTokens: string[] }> {
  const words = normalizeText(value).split(" ").filter(Boolean);
  const references: Array<{
    typeGroup: string[];
    destinationTokens: string[];
  }> = [];
  words.forEach((word, index) => {
    const typeGroup = CONTROL_TERM_GROUPS.find((group) =>
      group.includes(word),
    );
    if (!typeGroup) return;
    const start = Math.max(0, index - 3);
    const end = Math.min(words.length, index + 4);
    const destinationTokens = words
      .slice(start, end)
      .filter(
        (token, offset) =>
          start + offset !== index &&
          !NON_CONTENT_WORDS.has(token) &&
          !CONTROL_TERM_GROUPS.some((group) => group.includes(token)) &&
          !CONTROL_REFERENCE_ACTIONS.has(token) &&
          !CONTROL_REFERENCE_DECORATORS.has(token),
      );
    references.push({ typeGroup, destinationTokens });
  });
  return references;
}

function areComparableControlDestinationTokens(
  left: string,
  right: string,
): boolean {
  if (areComparableTokens(left, right)) return true;
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  return CONTROL_DESTINATION_TRANSLATIONS.some(
    (group) =>
      group.includes(normalizedLeft) && group.includes(normalizedRight),
  );
}

function areContactChannelsSupported(text: string, evidence: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedEvidence = normalizeText(evidence);
  for (const channelGroup of CONTACT_CHANNEL_GROUPS) {
    const claimUsesChannel = channelGroup.some((term) =>
      includesNormalizedPhrase(normalizedText, term),
    );
    if (
      claimUsesChannel &&
      !channelGroup.some((term) =>
        includesNormalizedPhrase(normalizedEvidence, term),
      )
    ) {
      return false;
    }
  }

  return extractContactMethodPhrases(normalizedText).every((method) => {
    const channelGroup = CONTACT_CHANNEL_GROUPS.find((group) =>
      group.some((term) => includesNormalizedPhrase(method, term)),
    );
    return channelGroup
      ? channelGroup.some((term) =>
          includesNormalizedPhrase(normalizedEvidence, term),
        )
      : includesNormalizedPhrase(normalizedEvidence, method);
  });
}

function extractContactMethodPhrases(normalizedText: string): string[] {
  const words = normalizedText.split(" ").filter(Boolean);
  const methods: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const matchedPreposition = CONTACT_METHOD_PREPOSITIONS.find((preposition) => {
      const phraseWords = preposition.split(" ");
      return phraseWords.every(
        (word, offset) => words[index + offset] === word,
      );
    });
    if (!matchedPreposition) continue;
    const phraseLength = matchedPreposition.split(" ").length;
    const methodWords: string[] = [];
    for (
      let next = index + phraseLength;
      next < words.length && methodWords.length < 3;
      next += 1
    ) {
      const word = words[next];
      if (
        NON_CONTENT_WORDS.has(word) ||
        ["or", "and", "o", "y"].includes(word)
      ) {
        break;
      }
      methodWords.push(word);
    }
    if (methodWords.length > 0) methods.push(methodWords.join(" "));
  }
  return methods;
}

function includesNormalizedPhrase(text: string, phrase: string): boolean {
  const normalizedPhrase = normalizeText(phrase);
  return Boolean(
    normalizedPhrase &&
      ` ${text} `.includes(` ${normalizedPhrase} `),
  );
}

function resolveSupportedClaims(
  claims: GroundedAnswerClaim[],
  chunks: RetrievedChunk[],
): GroundedAnswerClaim[] {
  const resolved: GroundedAnswerClaim[] = [];
  for (const claim of claims) {
    if (!isClaimSupportedByEvidence(claim, chunks)) continue;
    if (areActionsSupportedByEvidence(claim.text, claim.evidenceQuote)) {
      resolved.push(claim);
      continue;
    }
    const sourceAnswer = extractSourceAnswerSentence(claim.evidenceQuote);
    if (sourceAnswer) {
      resolved.push({
        ...claim,
        text: sourceAnswer,
        format: "paragraph",
      });
    }
  }
  return resolved;
}

function areActionsSupportedByEvidence(text: string, evidence: string): boolean {
  const claimWords = new Set(normalizeText(text).split(" "));
  const evidenceWords = new Set(normalizeText(evidence).split(" "));
  return ACTION_VERB_GROUPS.every((group) => {
    const claimUsesAction = group.some((word) => claimWords.has(word));
    return !claimUsesAction || group.some((word) => evidenceWords.has(word));
  });
}

function extractSourceAnswerSentence(evidence: string): string | undefined {
  const questionEnd = evidence.lastIndexOf("?");
  const remaining = evidence.slice(questionEnd + 1);
  const instructionStart =
      /\b(?:puedes|puede|contacta|ve|haz clic|selecciona|elige|utiliza|llama|encuentra|encontrar|you can|contact|go to|click|open|select|choose|use|call|find)\b/i.exec(
      remaining,
    );
  if (!instructionStart || instructionStart.index == null) return undefined;
  const start = instructionStart.index;
  const sentenceEnding = remaining.slice(start).search(/[.!?](?:\s|$)/);
  const snippet =
    sentenceEnding >= 0
      ? remaining.slice(start, start + sentenceEnding + 1)
      : remaining.slice(start);
  return contentTokens(snippet).length >= 3 ? snippet.trim() : undefined;
}

function isClaimSupportedByLiveData(
  claim: GroundedAnswerClaim,
  liveData: {
    clientName: string;
    facts: Record<string, string | number | boolean>;
  },
): boolean {
  const text = claim.text.trim();
  const evidence = claim.evidenceQuote.trim();
  if (
    !text ||
    !evidence ||
    evidence.length > 500 ||
    claim.citationIndex !== null
  ) {
    return false;
  }

  const serializedData = normalizeText(
    JSON.stringify({ clientName: liveData.clientName, facts: liveData.facts }),
  );
  const normalizedEvidence = normalizeText(evidence);
  if (!normalizedEvidence || !serializedData.includes(normalizedEvidence)) {
    return false;
  }
  const citesClientName =
    Boolean(liveData.clientName) &&
    normalizedEvidence.includes(normalizeText(liveData.clientName));
  const citesFact = Object.entries(liveData.facts).some(([key, value]) =>
    normalizedEvidence.includes(normalizeText(`${key} ${String(value)}`)),
  );
  if (!citesClientName && !citesFact) return false;

  const claimWords = normalizeText(text).split(" ");
  const evidenceWords = new Set(normalizedEvidence.split(" "));
  if (
    claimWords.some(
      (word) =>
        CONTROL_TERM_GROUPS.some(
          (group) =>
            group.includes(word) &&
            ![...evidenceWords].some((evidenceWord) =>
              group.includes(evidenceWord),
            ),
        ),
    )
  ) {
    return false;
  }

  const normalizedClaim = normalizeText(text);
  if (
    EXAMPLE_MARKERS.some((marker) => normalizedClaim.includes(marker)) &&
    !EXAMPLE_MARKERS.some((marker) => normalizedEvidence.includes(marker))
  ) {
    return false;
  }
  const quotedPhrases = [...text.matchAll(/["“”«»]([^"“”«»]+)["“”«»]/g)]
    .map((match) => normalizeText(match[1] ?? ""))
    .filter(Boolean);
  const hasControl = claimWords.some((word) =>
    CONTROL_TERM_GROUPS.some((group) => group.includes(word)),
  );
  if (
    quotedPhrases.some((phrase) => !normalizedEvidence.includes(phrase)) ||
    (quotedPhrases.length > 0 &&
      !(
        hasControl ||
        (QUOTED_SPEECH_MARKERS.test(normalizedClaim) &&
          QUOTED_SPEECH_MARKERS.test(normalizedEvidence))
      ))
  ) {
    return false;
  }

  const claimNumbers = text.match(/\d+(?:[.,]\d+)*/g) ?? [];
  const evidenceNumbers = new Set(evidence.match(/\d+(?:[.,]\d+)*/g) ?? []);
  return (
    claimNumbers.every((number) => evidenceNumbers.has(number)) &&
    areActionsSupportedByEvidence(text, evidence)
  );
}

function renderGroundedClaims(claims: GroundedAnswerClaim[]): string {
  const lines: string[] = [];
  let stepNumber = 0;
  let stepRunLength = 0;
  const stepRunLengths = claims.map((claim, index) => {
    if (claim.format !== "step") return 0;
    if (index > 0 && claims[index - 1]?.format === "step") return 0;
    let length = 0;
    for (let next = index; claims[next]?.format === "step"; next += 1) {
      length += 1;
    }
    return length;
  });

  claims.forEach((claim, index) => {
    const text = claim.text.trim().replace(/^(?:\d+[.)]|[-*•])\s*/, "");
    if (claim.format === "step") {
      if (index === 0 || claims[index - 1]?.format !== "step") {
        stepNumber = 0;
        stepRunLength = stepRunLengths[index] ?? 0;
      }
      stepNumber += 1;
      lines.push(
        stepRunLength > 1 ? `${stepNumber}. ${text}` : text,
      );
    } else {
      stepNumber = 0;
      stepRunLength = 0;
      lines.push(claim.format === "bullet" ? `• ${text}` : text);
    }
  });
  return lines.join("\n");
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function contentTokens(value: string): string[] {
  return [...new Set(
    normalizeText(value)
      .split(" ")
      .filter((word) => word.length >= 3 && !NON_CONTENT_WORDS.has(word)),
  )];
}

function hasLikelyLanguageTranslation(claim: string, evidence: string): boolean {
  const claimLanguage = detectLanguage(claim);
  const evidenceLanguage = detectLanguage(evidence);
  return Boolean(
    claimLanguage &&
      evidenceLanguage &&
      claimLanguage !== evidenceLanguage,
  );
}

function detectLanguage(value: string): "en" | "es" | undefined {
  const tokens = new Set(normalizeText(value).split(" "));
  const english = [
    "the", "are", "is", "in", "on", "from", "for", "you", "your", "with",
    "and", "or", "of", "can", "to",
  ].filter((word) => tokens.has(word)).length;
  const spanish = [
    "el", "la", "las", "los", "una", "uno", "en", "de", "del", "que", "para",
    "puedes", "puede", "está", "estan", "con", "por", "y",
  ].filter((word) => tokens.has(normalizeText(word))).length;
  if (english >= 2 && english > spanish) return "en";
  if (spanish >= 2 && spanish > english) return "es";
  return undefined;
}

function comparableToken(word: string): string {
  const suffixes = [
    "amientos", "imientos", "aciones", "ation", "ments", "ando", "iendo",
    "ados", "adas", "idos", "idas", "ing", "ed", "es", "as", "os", "en",
    "an", "ar", "er", "ir", "ado", "ada", "ido", "ida", "s", "a", "e", "o",
  ];
  for (const suffix of suffixes) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

function areComparableTokens(left: string, right: string): boolean {
  return comparableToken(left) === comparableToken(right);
}
