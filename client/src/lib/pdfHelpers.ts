import jsPDF from "jspdf";
import { BARCELLOS_LOGO_BASE64 } from "@/lib/barcellosLogo";

/**
 * Adiciona o cabeçalho padrão Barcellos Seguros ao documento PDF.
 * Retorna o nextY (posição Y onde o conteúdo pode começar).
 */
export function addBarcellosHeader(
  doc: jsPDF,
  title: string,
  subtitle?: string
): number {
  const pageW = doc.internal.pageSize.getWidth();

  // Barra azul topo
  doc.setFillColor(30, 64, 175);
  doc.rect(0, 0, pageW, 2, "F");

  // Fundo branco do cabeçalho
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 2, pageW, 23, "F");

  // Logo
  doc.addImage(BARCELLOS_LOGO_BASE64, "PNG", 8, 4, 38, 16);

  // Linha divisória vertical
  doc.setDrawColor(220, 220, 235);
  doc.setLineWidth(0.3);
  doc.line(50, 5, 50, 23);

  // Título
  doc.setTextColor(30, 64, 175);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(title, 55, 14);

  // Subtítulo/período (à direita)
  if (subtitle) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 100);
    doc.text(subtitle, pageW - 14, 12, { align: "right" });
  }

  // Data de geração (à direita, menor)
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(160, 160, 175);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, pageW - 14, 21, { align: "right" });

  // Barra azul base do cabeçalho
  doc.setFillColor(30, 64, 175);
  doc.rect(0, 25, pageW, 1.5, "F");

  // Reset cores para conteúdo
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);

  return 32; // nextY para o conteúdo
}

/**
 * Adiciona rodapé padrão Barcellos Seguros em todas as páginas.
 */
export function addBarcellosFooter(doc: jsPDF) {
  const n = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFillColor(245, 247, 252);
    doc.rect(0, pageH - 7, pageW, 7, "F");
    doc.setDrawColor(210, 215, 235);
    doc.setLineWidth(0.3);
    doc.line(0, pageH - 7, pageW, pageH - 7);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130, 130, 155);
    doc.text("Barcellos Seguros — Documento Confidencial de Uso Interno", 14, pageH - 2.5);
    doc.text(`pág. ${i} / ${n}`, pageW - 14, pageH - 2.5, { align: "right" });
  }
}
