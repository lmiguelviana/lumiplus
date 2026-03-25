/**
 * ButtonParserService — detecta [[buttons]] na resposta da IA
 * e converte para formatos nativos de cada canal.
 */

export interface ParsedButton {
  text: string;
  type: 'reply' | 'url' | 'callback';
  value: string;
}

export interface ParsedMessage {
  text: string;
  buttons: ParsedButton[];
  hasButtons: boolean;
}

export class ButtonParserService {

  /** Extrai botões da resposta da IA */
  static parse(content: string): ParsedMessage {
    const buttonRegex = /\[\[buttons\]\]([\s\S]*?)\[\[\/buttons\]\]/g;
    let textWithout = content;
    const buttons: ParsedButton[] = [];

    let match;
    while ((match = buttonRegex.exec(content)) !== null) {
      const block = match[1];
      textWithout = textWithout.replace(match[0], '').trim();

      // [Texto](url) → URL button
      const urlBtnRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
      let urlMatch;
      while ((urlMatch = urlBtnRegex.exec(block)) !== null) {
        buttons.push({ text: urlMatch[1], type: 'url', value: urlMatch[2] });
      }

      // [Texto]{callback:id} → Callback button
      const cbBtnRegex = /\[([^\]]+)\]\{callback:([^\}]+)\}/g;
      let cbMatch;
      while ((cbMatch = cbBtnRegex.exec(block)) !== null) {
        buttons.push({ text: cbMatch[1], type: 'callback', value: cbMatch[2] });
      }

      // [Texto] → Quick Reply (evita duplicatas)
      const replyBtnRegex = /\[([^\]]+)\](?!\(|{)/g;
      let replyMatch: RegExpExecArray | null;
      while ((replyMatch = replyBtnRegex.exec(block)) !== null) {
        const replyText = replyMatch[1];
        if (!buttons.find(b => b.text === replyText)) {
          buttons.push({ text: replyText, type: 'reply', value: replyText });
        }
      }
    }

    return { text: textWithout, buttons, hasButtons: buttons.length > 0 };
  }

  /** Converte para formato WhatsApp Baileys (buttons ou list) */
  static toWhatsApp(parsed: ParsedMessage) {
    if (parsed.buttons.length <= 3) {
      return {
        text: parsed.text,
        buttons: parsed.buttons.filter(b => b.type === 'reply').map((b, i) => ({
          buttonId: b.value || `btn_${i}`,
          buttonText: { displayText: b.text },
        })),
        headerType: 1,
      };
    }
    // List message para mais de 3
    return {
      text: parsed.text,
      buttonText: 'Ver opções',
      sections: [{
        title: 'Opções',
        rows: parsed.buttons.map((b, i) => ({
          title: b.text,
          rowId: b.value || `btn_${i}`,
        })),
      }],
    };
  }

  /** Converte para formato Telegram inline_keyboard */
  static toTelegram(parsed: ParsedMessage) {
    const rows: any[][] = [];
    for (let i = 0; i < parsed.buttons.length; i += 2) {
      const row = [parsed.buttons[i]];
      if (parsed.buttons[i + 1]) row.push(parsed.buttons[i + 1]);
      rows.push(row.map(b =>
        b.type === 'url'
          ? { text: b.text, url: b.value }
          : { text: b.text, callback_data: b.value.slice(0, 64) }
      ));
    }
    return { inline_keyboard: rows };
  }

  /** Converte para formato Web Chat (JSON para frontend) */
  static toWebChat(parsed: ParsedMessage) {
    return parsed.buttons.map(b => ({
      label: b.text,
      type: b.type,
      value: b.value,
    }));
  }

  /** Fallback: converte botões em texto numerado (se canal não suporta) */
  static toTextFallback(parsed: ParsedMessage): string {
    const numberedOptions = parsed.buttons
      .map((b, i) => `${i + 1}. ${b.text}`)
      .join('\n');
    return `${parsed.text}\n\n${numberedOptions}\n\n(Responda com o número da opção)`;
  }
}
