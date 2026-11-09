/**
 * Componente PWAInstallButton - Botão de instalação do PWA
 *
 * Exibe um botão discreto para instalação do app Néia Salgados como PWA.
 *
 * Comportamento:
 * - Android (Chrome): usa beforeinstallprompt quando disponível
 * - iPhone (Safari): exibe instruções para "Adicionar à Tela de Início"
 * - Não exibe se o app já estiver instalado (modo standalone)
 * - Não exibe repetidamente de forma invasiva (usa localStorage para lembrar)
 */

import { useEffect, useState, useCallback } from 'react';
import { Download, Menu, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession, useStaffOnly } from '@/lib/session';

const STORAGE_KEY = 'neia-pwa-install-dismissed';

export function PWAInstallButton() {
  const { user } = useSession();
  const { staffOnly } = useStaffOnly();
  const [showInstall, setShowInstall] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Não mostrar em rotas admin/staff
  if (staffOnly) {
    return null;
  }

  useEffect(() => {
    // Detectar se já está em modo standalone (app já instalado)
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(isStandaloneMode);

    // Detectar iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    // Verificar se o usuário já descartou o convite
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed === 'true' || isStandaloneMode) {
      setShowInstall(false);
      return;
    }

    // Mostrar o botão de instalação para navegadores que suportam PWA
    const canInstall = 'serviceWorker' in navigator;
    setShowInstall(canInstall && !isStandaloneMode);
  }, [staffOnly]);

  // Capturar o evento beforeinstallprompt (Android Chrome)
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstall = useCallback(async () => {
    if (isIOS) {
      // iOS: não há beforeinstallprompt, apenas mostrar instruções
      setShowInstall(false);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        localStorage.setItem(STORAGE_KEY, 'true');
        setShowInstall(false);
      } else {
        // Usuário recusou, não mostrar novamente por enquanto
        localStorage.setItem(STORAGE_KEY, 'true');
        setShowInstall(false);
      }
    }
  }, [deferredPrompt, isIOS]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setShowInstall(false);
  }, []);

  if (!showInstall) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      <Button
        onClick={handleInstall}
        size="sm"
        variant="outline"
        className="bg-white border border-border shadow-lg"
      >
        <Download className="w-4 h-4 mr-2" />
        Instalar Aplicativo
      </Button>

      {isIOS && (
        <div className="bg-white border border-border rounded-lg p-3 shadow-lg max-w-xs text-sm text-foreground">
          <div className="flex items-start gap-2 mb-2">
            <Info className="w-4 h-4 text-primary mt-0.5" />
            <span className="font-medium">Como instalar no iPhone:</span>
          </div>
          <ol className="text-xs text-muted-foreground space-y-1 pl-4">
            <li>Toque no ícone de <b>compartilhar</b> (�•) no Safari</li>
            <li>Role até <b>"Adicionar à Tela de Início"</b></li>
            <li>Toque em <b>Adicionar</b></li>
          </ol>
          <button
            onClick={handleDismiss}
            className="mt-2 text-xs text-primary underline decoration-primary/40 hover:decoration-primary/80"
          >
            Não mostrar novamente
          </button>
        </div>
      )}

      {!isIOS && (
        <button
          onClick={handleDismiss}
          className="text-xs text-muted-foreground underline decoration-muted/30 hover:decoration-muted/60"
        >
          Não mostrar novamente
        </button>
      )}
    </div>
  );
}
