import { Button } from "@/components/ui/button";
import React from "react";
interface Props {
  onTransactions: (file: File) => void;
  onPayments: (file: File) => void;
}
const DataUploader: React.FC<Props> = ({
  onTransactions,
  onPayments
}) => {
  const txRef = React.useRef<HTMLInputElement>(null);
  const pyRef = React.useRef<HTMLInputElement>(null);
  return <div className="flex flex-col md:flex-row items-center gap-3">
      <input ref={txRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => {
      const f = e.target.files?.[0];
      if (f) onTransactions(f);
    }} />
      <input ref={pyRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => {
      const f = e.target.files?.[0];
      if (f) onPayments(f);
    }} />
      <Button variant="hero" onClick={() => txRef.current?.click()} className="text-slate-50 bg-violet-950 hover:bg-violet-800 rounded">Importar Transações</Button>
      <Button variant="premium" onClick={() => pyRef.current?.click()} className="text-slate-50 bg-violet-950 hover:bg-violet-800">Importar Pagamentos</Button>
    </div>;
};
export default DataUploader;