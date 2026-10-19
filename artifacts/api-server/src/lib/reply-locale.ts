export type ReplyLocale = "en" | "es" | "it" | "fr";

const FALLBACK_MESSAGES = {
  noMatchingRule: {
    en: "I couldn't identify a configured support workflow for that request. Could you provide more detail?",
    es: "No pude identificar un flujo de soporte configurado para esa solicitud. ¿Podrías darme más detalles?",
    it: "Non sono riuscito a identificare un flusso di supporto configurato per questa richiesta. Potresti fornire più dettagli?",
    fr: "Je n’ai pas pu identifier un flux d’assistance configuré pour cette demande. Pourriez-vous donner plus de détails ?",
  },
  accessDenied: {
    en: "I don't have permission to access the information needed for this request. Please contact an administrator or human support agent.",
    es: "No tengo permiso para acceder a la información necesaria para esta solicitud. Ponte en contacto con un administrador o un agente de soporte humano.",
    it: "Non ho il permesso di accedere alle informazioni necessarie per questa richiesta. Contatta un amministratore o un agente di supporto umano.",
    fr: "Je n’ai pas l’autorisation d’accéder aux informations nécessaires pour cette demande. Veuillez contacter un administrateur ou un agent de support humain.",
  },
  resolutionFollowUp: {
    en: "Does this answer your question? Please let me know if you need further assistance.",
    es: "¿Esta respuesta responde a tu pregunta? Avísame si necesitas más ayuda.",
    it: "Questa risposta risponde alla tua domanda? Fammi sapere se hai bisogno di ulteriore assistenza.",
    fr: "Cette réponse répond-elle à votre question ? N’hésitez pas à me dire si vous avez besoin d’aide supplémentaire.",
  },
  assistantUnavailable: {
    en: "The assistant is temporarily unavailable. Please try again.",
    es: "El asistente no está disponible temporalmente. Inténtalo de nuevo.",
    it: "L’assistente non è temporaneamente disponibile. Riprova.",
    fr: "L’assistant est temporairement indisponible. Veuillez réessayer.",
  },
  greeting: {
    en: "Hello! I'm your AI support assistant. How can I help you today?",
    es: "¡Hola! Soy tu asistente de soporte. ¿En qué puedo ayudarte hoy?",
    it: "Ciao! Sono il tuo assistente di supporto. Come posso aiutarti oggi?",
    fr: "Bonjour ! Je suis votre assistant d’assistance. Comment puis-je vous aider aujourd’hui ?",
  },
  resolved: {
    en: "Great to hear! If you need anything else, don't hesitate to reach out. Have a great day!\n\nWas this helpful? You can rate this answer below.",
    es: "¡Me alegra saberlo! Si necesitas algo más, no dudes en escribirnos. ¡Que tengas un buen día!\n\n¿Te ha resultado útil? Puedes valorar esta respuesta a continuación.",
    it: "Mi fa piacere! Se hai bisogno di altro, non esitare a contattarci. Buona giornata!\n\nTi è stato utile? Puoi valutare questa risposta qui sotto.",
    fr: "Ravi de l’apprendre ! N’hésitez pas à nous recontacter si vous avez besoin d’autre chose. Bonne journée !\n\nCette réponse vous a-t-elle aidé ? Vous pouvez l’évaluer ci-dessous.",
  },
  unableToAnswer: {
    en: "{user_name}, I couldn't find enough information in the knowledge base to answer that.",
    es: "{user_name}, no he encontrado suficiente información para responder a esa pregunta.",
    it: "{user_name}, non ho trovato informazioni sufficienti per rispondere a questa domanda.",
    fr: "{user_name}, je n’ai pas trouvé assez d’informations pour répondre à cette question.",
  },
  liveClientNameRequired: {
    en: "Which client's information would you like me to check?",
    es: "¿De qué cliente quieres que consulte la información?",
    it: "Di quale cliente vuoi che controlli le informazioni?",
    fr: "Pour quel client souhaitez-vous que je vérifie les informations ?",
  },
  liveClientRequiresSignIn: {
    en: "Please sign in to your workspace to check individual client information.",
    es: "Inicia sesión en tu espacio de trabajo para consultar información de un cliente.",
    it: "Accedi al tuo spazio di lavoro per consultare le informazioni di un cliente.",
    fr: "Connectez-vous à votre espace de travail pour consulter les informations d’un client.",
  },
  liveClientNoMatch: {
    en: "I couldn't find a client matching that name. Please check the spelling and try again.",
    es: "No he encontrado ningún cliente con ese nombre. Comprueba cómo se escribe e inténtalo de nuevo.",
    it: "Non ho trovato un cliente con questo nome. Controlla l’ortografia e riprova.",
    fr: "Je n’ai trouvé aucun client correspondant à ce nom. Vérifiez l’orthographe et réessayez.",
  },
  liveClientAmbiguous: {
    en: "I found more than one matching client. Please tell me the city or another detail your team uses to distinguish them.",
    es: "He encontrado más de un cliente con ese nombre. Indícame la ciudad u otro dato que utilice tu equipo para distinguirlos.",
    it: "Ho trovato più clienti con questo nome. Indicami la città o un altro dettaglio usato dal tuo team per distinguerli.",
    fr: "J’ai trouvé plusieurs clients correspondant à ce nom. Indiquez la ville ou un autre détail utilisé par votre équipe pour les distinguer.",
  },
  liveClientTooManyMatches: {
    en: "I found several possible clients. Please add a city or another detail your team uses to narrow down the search.",
    es: "He encontrado varios clientes posibles. Indícame la ciudad u otro dato que utilice tu equipo para concretar la búsqueda.",
    it: "Ho trovato diversi clienti possibili. Indicami la città o un altro dettaglio usato dal tuo team per restringere la ricerca.",
    fr: "J’ai trouvé plusieurs clients possibles. Indiquez la ville ou un autre détail utilisé par votre équipe pour préciser la recherche.",
  },
  liveClientUnavailable: {
    en: "I can't access this client's information right now. Please try again later or contact your support team.",
    es: "Ahora mismo no puedo acceder a la información de este cliente. Inténtalo más tarde o contacta con tu equipo de soporte.",
    it: "Al momento non riesco ad accedere alle informazioni di questo cliente. Riprova più tardi o contatta il team di supporto.",
    fr: "Je ne peux pas accéder aux informations de ce client pour le moment. Réessayez plus tard ou contactez votre équipe d’assistance.",
  },
  escalationOffer: {
    en: "Sorry {user_name}, I cannot answer that. Would you like me to connect you with a support agent?",
    es: "Lo siento, {user_name}, no puedo responder a eso. ¿Quieres que te ponga en contacto con un agente de soporte?",
    it: "Mi dispiace, {user_name}, non posso rispondere. Vuoi che ti metta in contatto con un operatore?",
    fr: "Désolé, {user_name}, je ne peux pas répondre à cela. Souhaitez-vous être mis en relation avec un agent du support ?",
  },
  closing: {
    en: "This conversation has been closed after a period of inactivity.",
    es: "Esta conversación se ha cerrado tras un periodo de inactividad.",
    it: "Questa conversazione è stata chiusa dopo un periodo di inattività.",
    fr: "Cette conversation a été clôturée après une période d’inactivité.",
  },
  welcome: {
    en: "Hello {user_name}, you are speaking {agent_name}. How can I help you?",
    es: "Hola {user_name}, estás hablando con {agent_name}. ¿Cómo puedo ayudarte?",
    it: "Ciao {user_name}, stai parlando con {agent_name}. Come posso aiutarti?",
    fr: "Bonjour {user_name}, vous parlez avec {agent_name}. Comment puis-je vous aider ?",
  },
} as const;

export function resolveReplyLocale(
  ...candidates: unknown[]
): ReplyLocale {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const normalized = candidate.trim().replaceAll("_", "-").toLowerCase();
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(normalized)) continue;
    const language = normalized.split("-")[0];
    if (language === "es" || language === "it" || language === "fr") {
      return language;
    }
    if (language === "en") return "en";
  }
  return "en";
}

export function localizedCommunicationMessage(
  kind: keyof typeof FALLBACK_MESSAGES,
  ...localeCandidates: unknown[]
): string {
  return FALLBACK_MESSAGES[kind][resolveReplyLocale(...localeCandidates)];
}

export function fallbackClarificationPrompt(
  kind: keyof typeof FALLBACK_MESSAGES,
  ...localeCandidates: unknown[]
): string {
  const locale = resolveReplyLocale(...localeCandidates);
  return FALLBACK_MESSAGES[kind][locale];
}

export function resolutionFollowUp(...localeCandidates: unknown[]): string {
  return fallbackClarificationPrompt("resolutionFollowUp", ...localeCandidates);
}
