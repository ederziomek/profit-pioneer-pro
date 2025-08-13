import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import React, { useState } from "react";
import { Loader2, Upload, CheckCircle, AlertCircle } from "lucide-react";

interface Props {
  onTransactions: (file: File) => Promise<void>;
  onPayments: (file: File) => Promise<void>;
}

const DataUploader: React.FC<Props> = ({
  onTransactions,
  onPayments
}) => {
  const [isUploadingTx, setIsUploadingTx] = useState(false);
  const [isUploadingPy, setIsUploadingPy] = useState(false);
  
  const txRef = React.useRef<HTMLInputElement>(null);
  const pyRef = React.useRef<HTMLInputElement>(null);

  const handleTransactionsUpload = async (file: File) => {
    if (isUploadingTx || isUploadingPy) {
      toast({
        title: "Aguarde",
        description: "Já existe uma importação em andamento. Aguarde a conclusão.",
        variant: "destructive"
      });
      return;
    }

    setIsUploadingTx(true);
    
    try {
      // Mostrar toast de início
      toast({
        title: "Importação Iniciada",
        description: `Processando arquivo: ${file.name} (${(file.size / (1024*1024)).toFixed(1)} MB)`,
      });

      await onTransactions(file);
      
      // Sucesso
      toast({
        title: "Importação Concluída",
        description: "Transações importadas com sucesso!",
      });
      
    } catch (error) {
      console.error('Erro na importação:', error);
      toast({
        title: "Erro na Importação",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    } finally {
      setIsUploadingTx(false);
      // Limpar input para permitir re-upload do mesmo arquivo
      if (txRef.current) txRef.current.value = '';
    }
  };

  const handlePaymentsUpload = async (file: File) => {
    if (isUploadingTx || isUploadingPy) {
      toast({
        title: "Aguarde",
        description: "Já existe uma importação em andamento. Aguarde a conclusão.",
        variant: "destructive"
      });
      return;
    }

    setIsUploadingPy(true);
    
    try {
      // Mostrar toast de início
      toast({
        title: "Importação Iniciada",
        description: `Processando arquivo: ${file.name} (${(file.size / (1024*1024)).toFixed(1)} MB)`,
      });

      await onPayments(file);
      
      // Sucesso
      toast({
        title: "Importação Concluída",
        description: "Pagamentos importados com sucesso!",
      });
      
    } catch (error) {
      console.error('Erro na importação:', error);
      toast({
        title: "Erro na Importação",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    } finally {
      setIsUploadingPy(false);
      // Limpar input para permitir re-upload do mesmo arquivo
      if (pyRef.current) pyRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col md:flex-row items-center gap-3">
      <input 
        ref={txRef} 
        type="file" 
        accept=".xlsx,.xls,.csv" 
        className="hidden" 
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleTransactionsUpload(f);
        }} 
        disabled={isUploadingTx || isUploadingPy}
      />
      
      <input 
        ref={pyRef} 
        type="file" 
        accept=".xlsx,.xls,.csv" 
        className="hidden" 
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handlePaymentsUpload(f);
        }} 
        disabled={isUploadingTx || isUploadingPy}
      />
      
      <Button 
        variant="topbar" 
        onClick={() => txRef.current?.click()}
        disabled={isUploadingTx || isUploadingPy}
        className="min-w-[180px]"
      >
        {isUploadingTx ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Importando...
          </>
        ) : (
          <>
            <Upload className="mr-2 h-4 w-4" />
            Importar Transações
          </>
        )}
      </Button>
      
      <Button 
        variant="topbar" 
        onClick={() => pyRef.current?.click()}
        disabled={isUploadingTx || isUploadingPy}
        className="min-w-[180px]"
      >
        {isUploadingPy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Importando...
          </>
        ) : (
          <>
            <Upload className="mr-2 h-4 w-4" />
            Importar Pagamentos
          </>
        )}
      </Button>
      
      {(isUploadingTx || isUploadingPy) && (
        <div className="text-sm text-muted-foreground flex items-center">
          <AlertCircle className="mr-1 h-4 w-4" />
          Processando arquivo grande... Isso pode levar alguns minutos.
        </div>
      )}
    </div>
  );
};

export default DataUploader;