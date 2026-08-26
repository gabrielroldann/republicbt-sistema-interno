import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { useFiltros, type PresetPeriodo } from '@/painel/store/filtros';
import { Button } from '@/components/ui/button';
import { Input, Campo } from '@/components/ui/field';
import { cn, fmtData, isoDia } from '@/lib/utils';

const presets: { id: PresetPeriodo; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'mes', label: 'Mês atual' },
];

export function PeriodoPicker() {
  const { periodo, preset, setPreset, setPeriodoCustom } = useFiltros();
  const [aberto, setAberto] = useState(false);
  const [de, setDe] = useState(isoDia(periodo.de));
  const [ate, setAte] = useState(isoDia(periodo.ate));

  function aplicar() {
    const d = new Date(`${de}T12:00:00`);
    const a = new Date(`${ate}T12:00:00`);
    if (d <= a) {
      setPeriodoCustom(d, a);
      setAberto(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center rounded-md border border-line bg-card p-0.5">
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => setPreset(p.id)}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-medium transition-colors duration-150',
              preset === p.id ? 'bg-navy-700 text-white' : 'text-ink-2 hover:bg-elev',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <Popover.Root open={aberto} onOpenChange={setAberto}>
        <Popover.Trigger asChild>
          <Button variant="outline" size="sm" className={cn(preset === 'custom' && 'border-navy-500 text-navy-200')}>
            <CalendarDays className="h-3.5 w-3.5" />
            {preset === 'custom'
              ? `${fmtData(periodo.de)} – ${fmtData(periodo.ate)}`
              : 'Período'}
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end" sideOffset={6}
            className="z-50 w-64 rounded-md border border-line bg-card p-4 shadow-flutuante"
          >
            <div className="space-y-3">
              <Campo label="De"><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Campo>
              <Campo label="Até"><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></Campo>
              <Button className="w-full" size="sm" onClick={aplicar}>Aplicar</Button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
