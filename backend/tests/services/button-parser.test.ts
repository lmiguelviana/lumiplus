import { describe, it, expect } from 'vitest';
import { ButtonParserService } from '../../src/services/button-parser.service.js';

describe('ButtonParserService', () => {

  it('deve detectar botões simples [[buttons]]', () => {
    const input = 'Escolha:\n\n[[buttons]] [Vendas] [Suporte] [Financeiro] [[/buttons]]';
    const result = ButtonParserService.parse(input);

    expect(result.hasButtons).toBe(true);
    expect(result.buttons).toHaveLength(3);
    expect(result.buttons[0]).toEqual({ text: 'Vendas', type: 'reply', value: 'Vendas' });
    expect(result.buttons[1]).toEqual({ text: 'Suporte', type: 'reply', value: 'Suporte' });
    expect(result.text).toBe('Escolha:');
  });

  it('deve detectar botões URL', () => {
    const input = 'Veja mais:\n[[buttons]] [Abrir site](https://exemplo.com) [[/buttons]]';
    const result = ButtonParserService.parse(input);

    expect(result.hasButtons).toBe(true);
    expect(result.buttons[0]).toEqual({ text: 'Abrir site', type: 'url', value: 'https://exemplo.com' });
  });

  it('deve retornar sem botões quando não tem markup', () => {
    const input = 'Olá, como posso ajudar?';
    const result = ButtonParserService.parse(input);

    expect(result.hasButtons).toBe(false);
    expect(result.buttons).toHaveLength(0);
    expect(result.text).toBe('Olá, como posso ajudar?');
  });

  it('deve converter para WhatsApp (≤3 = buttons)', () => {
    const parsed = ButtonParserService.parse('Escolha:\n[[buttons]] [A] [B] [[/buttons]]');
    const wa = ButtonParserService.toWhatsApp(parsed);

    expect(wa.buttons).toHaveLength(2);
    expect(wa.buttons[0].buttonText.displayText).toBe('A');
  });

  it('deve converter para Telegram (inline keyboard)', () => {
    const parsed = ButtonParserService.parse('Escolha:\n[[buttons]] [A] [B] [C] [[/buttons]]');
    const tg = ButtonParserService.toTelegram(parsed);

    expect(tg.inline_keyboard).toHaveLength(2); // 2 linhas (2+1)
    expect(tg.inline_keyboard[0][0].text).toBe('A');
  });

  it('deve gerar fallback de texto numerado', () => {
    const parsed = ButtonParserService.parse('Escolha:\n[[buttons]] [Vendas] [Suporte] [[/buttons]]');
    const fallback = ButtonParserService.toTextFallback(parsed);

    expect(fallback).toContain('1. Vendas');
    expect(fallback).toContain('2. Suporte');
  });
});
