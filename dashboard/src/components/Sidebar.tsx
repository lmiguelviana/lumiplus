'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Terminal,
  Settings,
  Sun,
  Moon,
  MessageSquare,
  ChevronRight,
  Share2,
  Brain,
  Workflow,
  Sparkles,
  LogOut,
  BookOpen
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  const handleLogout = () => {
    localStorage.removeItem('lumi-token');
    document.cookie = 'lumi-token=; path=/; max-age=0';
    router.replace('/login');
  };

  // Carrega preferência de tema do banco ao montar
  React.useEffect(() => {
    setMounted(true);
    api.get('/settings').then((res) => {
      const saved = res.data?.settings?.theme;
      if (saved && (saved === 'dark' || saved === 'light')) {
        setTheme(saved);
      }
    }).catch(() => {});
  }, [setTheme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    api.put('/settings/theme', { value: next }).catch(() => {});
  };

  const menuItems = [
    { icon: LayoutDashboard, label: 'Resumo', href: '/' },
    { icon: MessageSquare, label: 'Chat Web', href: '/chat' },
    { icon: Users, label: 'Agentes', href: '/agents' },
    { icon: Workflow, label: 'Workflows', href: '/workflows' },
    { icon: Sparkles, label: 'Skills', href: '/skills' },
    { icon: Brain, label: 'Conhecimento', href: '/knowledge' },
    { icon: Share2, label: 'Canais', href: '/channels' },
    { icon: Terminal, label: 'Logs', href: '/logs' },
    { icon: Settings, label: 'Config', href: '/settings' },
    { icon: BookOpen, label: 'Ajuda', href: '/help' },
  ];

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-surface border-r border-border-strong hidden lg:flex flex-col z-50">
      {/* Brand Header */}
      <div className="p-8 border-b border-border-strong">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary flex items-center justify-center">
            <span className="text-white font-black text-xl">L</span>
          </div>
          <h1 className="font-black tracking-tighter text-xl uppercase italic">
            Lumi <span className="text-primary italic">Plus</span>
          </h1>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <motion.div
                whileHover={{ x: 4 }}
                className={cn(
                  "flex items-center justify-between p-3 transition-all group",
                  isActive 
                    ? "bg-primary text-white" 
                    : "hover:bg-foreground/5 text-muted hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon className={cn("w-5 h-5", isActive ? "text-white" : "text-primary")} />
                  <span className="font-bold text-xs uppercase tracking-widest">{item.label}</span>
                </div>
                <ChevronRight className={cn("w-4 h-4 transition-transform", isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100")} />
              </motion.div>
            </Link>
          );
        })}
      </nav>

      {/* Theme Toggle & Footer */}
      <div className="p-6 border-t border-border-strong space-y-4">
        <button 
          onClick={toggleTheme}
          className="w-full btn-industrial flex items-center justify-center gap-2"
        >
          {!mounted ? (
            <div className="w-4 h-4 border border-border-strong animate-pulse" />
          ) : theme === 'dark' ? (
            <><Sun className="w-4 h-4" /> Light Mode</>
          ) : (
            <><Moon className="w-4 h-4" /> Dark Mode</>
          )}
        </button>
        
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 p-2 text-xs font-bold uppercase tracking-widest text-muted hover:text-red-400 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>

        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-bold text-muted uppercase tracking-tighter">System Version</p>
          <p className="text-xs font-black italic">v2.0.8-PRO-MAX</p>
        </div>
      </div>
    </aside>
  );
}
