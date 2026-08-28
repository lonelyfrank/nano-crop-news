/**
 * Contratto per la generazione del riassunto di un articolo. Disaccoppia
 * l'ingestion dall'implementazione concreta: la v1 usa semplicemente
 * l'excerpt del feed RSS (RssExcerptSummaryGenerator); in futuro basterà
 * cambiare quale generatore viene istanziato in index.ts verso uno basato su
 * AI, senza toccare il resto dello script.
 */
export interface SummaryGenerator {
  generate(content: string): string
}

/**
 * Implementazione di default per la v1: il "riassunto" è semplicemente
 * l'excerpt fornito dal feed RSS della fonte, senza alcuna elaborazione.
 */
export class RssExcerptSummaryGenerator implements SummaryGenerator {
  generate(content: string): string {
    return content
  }
}

/**
 * Placeholder per il futuro generatore di riassunti basato su AI.
 *
 * TODO: implementare la chiamata al provider AI scelto e impostare
 * summary_type = 'ai_generated' lato chiamante.
 */
export class AiSummaryGenerator implements SummaryGenerator {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- firma imposta dall'interfaccia, implementazione non ancora scritta
  generate(_content: string): string {
    throw new Error('AiSummaryGenerator non è ancora implementato.')
  }
}
