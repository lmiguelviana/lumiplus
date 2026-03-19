'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

type Step = 1 | 2 | 3;

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    workspaceName: '',
    openrouterKey: '',
  });

  useEffect(() => {
    // Verifica se sistema já foi configurado
    axios.get('/api/v1/auth/setup/status').then(res => {
      if (!res.data.needsSetup) {
        router.replace('/login');
      } else {
        setChecking(false);
      }
    }).catch(() => setChecking(false));
  }, [router]);

  const set = (field: string, value: string) =>
    setForm(f => ({ ...f, [field]: value }));

  const nextStep = () => {
    setError('');
    if (step === 1) {
      if (!form.name.trim() || !form.email.trim() || !form.password) {
        setError('Preencha todos os campos obrigatórios.');
        return;
      }
      if (form.password.length < 8) {
        setError('Senha deve ter pelo menos 8 caracteres.');
        return;
      }
      if (form.password !== form.confirmPassword) {
        setError('As senhas não coincidem.');
        return;
      }
    }
    if (step === 2) {
      if (!form.workspaceName.trim()) {
        setError('Nome do workspace é obrigatório.');
        return;
      }
    }
    setStep((s) => (s + 1) as Step);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.post('/api/v1/auth/setup', {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        workspaceName: form.workspaceName.trim(),
        openrouterKey: form.openrouterKey.trim() || undefined,
      });

      const { token } = res.data;
      // Salva token em cookie e localStorage
      document.cookie = `lumi-token=${token}; path=/; max-age=${30 * 24 * 3600}`;
      localStorage.setItem('lumi-token', token);

      router.replace('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao configurar sistema.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 mb-4">
            <span className="text-3xl">🤖</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Lumi Plus</h1>
          <p className="text-zinc-400 text-sm mt-1">Configuração inicial do sistema</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {([1, 2, 3] as Step[]).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                s < step ? 'bg-orange-500 text-white' :
                s === step ? 'bg-orange-500 text-white ring-2 ring-orange-500/30' :
                'bg-zinc-800 text-zinc-500'
              }`}>
                {s < step ? '✓' : s}
              </div>
              {s < 3 && <div className={`w-12 h-0.5 ${s < step ? 'bg-orange-500' : 'bg-zinc-800'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">

          {/* Step 1: Conta Admin */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-white font-semibold text-lg">Criar conta admin</h2>
                <p className="text-zinc-400 text-sm mt-1">Esse será o usuário principal do sistema.</p>
              </div>
              <div>
                <label className="text-zinc-300 text-sm block mb-1">Nome *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="Seu nome"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-zinc-300 text-sm block mb-1">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="admin@empresa.com"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-zinc-300 text-sm block mb-1">Senha *</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-zinc-300 text-sm block mb-1">Confirmar senha *</label>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={e => set('confirmPassword', e.target.value)}
                  placeholder="Repita a senha"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>
          )}

          {/* Step 2: Workspace */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-white font-semibold text-lg">Seu workspace</h2>
                <p className="text-zinc-400 text-sm mt-1">Dê um nome para o seu ambiente de trabalho.</p>
              </div>
              <div>
                <label className="text-zinc-300 text-sm block mb-1">Nome do workspace *</label>
                <input
                  type="text"
                  value={form.workspaceName}
                  onChange={e => set('workspaceName', e.target.value)}
                  placeholder="Ex: Minha Empresa, Projeto X..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>
          )}

          {/* Step 3: API de IA */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-white font-semibold text-lg">Configurar IA</h2>
                <p className="text-zinc-400 text-sm mt-1">
                  Adicione sua chave do OpenRouter para os agentes funcionarem.
                  Você pode pular e configurar depois em Configurações.
                </p>
              </div>
              <div>
                <label className="text-zinc-300 text-sm block mb-1">
                  OpenRouter API Key
                  <span className="text-zinc-500 ml-1">(opcional)</span>
                </label>
                <input
                  type="password"
                  value={form.openrouterKey}
                  onChange={e => set('openrouterKey', e.target.value)}
                  placeholder="sk-or-v1-..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
                />
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-400 text-xs mt-1 inline-block hover:underline"
                >
                  Obter chave em openrouter.ai/keys →
                </a>
              </div>

              <div className="bg-zinc-800/50 rounded-lg p-3 text-sm text-zinc-400">
                <p className="font-medium text-zinc-300 mb-1">Resumo da configuração:</p>
                <p>👤 Admin: <span className="text-white">{form.name} ({form.email})</span></p>
                <p>🏢 Workspace: <span className="text-white">{form.workspaceName}</span></p>
                <p>🤖 IA: <span className="text-white">{form.openrouterKey ? 'OpenRouter configurado' : 'Configurar depois'}</span></p>
              </div>
            </div>
          )}

          {/* Erro */}
          {error && (
            <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Botões */}
          <div className="flex gap-3 mt-6">
            {step > 1 && (
              <button
                onClick={() => setStep(s => (s - 1) as Step)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg py-2.5 font-medium transition-colors"
              >
                Voltar
              </button>
            )}
            {step < 3 ? (
              <button
                onClick={nextStep}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-lg py-2.5 font-medium transition-colors"
              >
                Continuar
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg py-2.5 font-medium transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Configurando...
                  </>
                ) : 'Concluir configuração'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
