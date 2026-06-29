import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";

interface ExportButtonProps {
  mes?: number;
  ano?: number;
  filtroTipo?: string;
  filtroStatus?: string;
  filtroVinculo?: string;
  filtroCategoria?: string;
  onPDF?: () => void;
}

export default function ExportButton({
  mes,
  ano = new Date().getFullYear(),
  filtroTipo,
  filtroStatus,
  filtroVinculo,
  filtroCategoria,
  onPDF,
}: ExportButtonProps) {
  const [loading, setLoading] = useState(false);

  const buildUrl = (format: "excel" | "pdf") => {
    const params = new URLSearchParams();
    params.set("ano", String(ano));
    if (mes) params.set("mes", String(mes));
    if (filtroTipo && filtroTipo !== "TODOS") params.set("tipo", filtroTipo);
    if (filtroStatus && filtroStatus !== "TODOS") params.set("status", filtroStatus);
    if (filtroVinculo && filtroVinculo !== "TODOS") params.set("vinculo", filtroVinculo);
    if (filtroCategoria && filtroCategoria !== "TODAS") params.set("categoria", filtroCategoria);
    return `/api/export/${format}?${params.toString()}`;
  };

  const handleExport = async (format: "excel" | "pdf") => {
    setLoading(true);
    try {
      const url = buildUrl(format);
      if (format === "excel") {
        const a = document.createElement("a");
        a.href = url;
        a.download = mes ? `contas_mes_${mes}_${ano}.xlsx` : `contas_${ano}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success("Exportação Excel iniciada!");
      } else {
        window.open(url, "_blank");
        toast.success("Relatório PDF aberto em nova aba!");
      }
    } catch (err) {
      toast.error("Erro ao exportar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2" disabled={loading}>
          <Download className="w-4 h-4" />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport("excel")} className="gap-2 cursor-pointer">
          <FileSpreadsheet className="w-4 h-4 text-green-600" />
          Exportar Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPDF ? onPDF() : handleExport("pdf")} className="gap-2 cursor-pointer">
          <FileText className="w-4 h-4 text-red-600" />
          Exportar PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
