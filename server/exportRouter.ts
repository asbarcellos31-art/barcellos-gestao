import express from "express";
import { listarTodasContas, listarContas } from "./db";
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const CATEGORIAS: Record<string, string> = {
  SALARIO: "Salário", COMISSAO: "Comissão", DISTRIBUICAO: "Distribuição",
  VEICULO: "Veículo", ESTRUTURA: "Estrutura", BANCO: "Banco",
  IMPOSTOS: "Impostos", ALIMENTACAO: "Alimentação", MATERIAL_ESCRITORIO: "Material Escritório", DIVERSOS: "Diversos",
};

function formatDate(value: any) {
  if (!value) return "";
  const d = new Date(String(value) + "T12:00:00");
  return d.toLocaleDateString("pt-BR");
}

function formatCurrency(value: any) {
  return parseFloat(String(value ?? 0)).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

export const exportRouter = express.Router();

exportRouter.get("/api/export/excel", async (req, res) => {
  try {
    const XLSX = await import("xlsx");
    const ano = req.query.ano ? parseInt(String(req.query.ano)) : new Date().getFullYear();
    const mes = req.query.mes ? parseInt(String(req.query.mes)) : undefined;
    const filtroTipo = req.query.tipo ? String(req.query.tipo) : undefined;
    const filtroStatus = req.query.status ? String(req.query.status) : undefined;
    const filtroVinculo = req.query.vinculo ? String(req.query.vinculo) : undefined;
    const filtroCategoria = req.query.categoria ? String(req.query.categoria) : undefined;

    let contas = mes
      ? await listarContas({ mes, ano })
      : await listarTodasContas(ano);

    if (filtroTipo) contas = contas.filter(c => (c as any).tipo === filtroTipo);
    if (filtroStatus) contas = contas.filter(c => c.status === filtroStatus);
    if (filtroVinculo) contas = contas.filter(c => c.vinculo === filtroVinculo);
    if (filtroCategoria) contas = contas.filter(c => c.categoria === filtroCategoria);

    const rows = contas.map((c) => ({
      "ID": c.id,
      "Mês": MESES[c.mes - 1],
      "Ano": c.ano,
      "Descrição": c.descricao,
      "Data Vencimento": formatDate(c.dataVencimento),
      "Valor": formatCurrency(c.valor),
      "Data Pagamento": formatDate(c.dataPagamento),
      "Status": c.status,
      "Categoria": CATEGORIAS[c.categoria] ?? c.categoria,
      "Vínculo": c.vinculo,
      "Valor Pago": c.valorPago ? formatCurrency(c.valorPago) : "",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    // Largura das colunas
    ws["!cols"] = [
      { wch: 6 }, { wch: 12 }, { wch: 6 }, { wch: 30 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 12 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Lançamentos");

    // Aba de resumo
    const totalAPagar = contas.reduce((acc, c) => acc + parseFloat(String(c.valor)), 0);
    const totalPago = contas.filter(c => c.status === "PAGO").reduce((acc, c) => acc + parseFloat(String(c.valorPago ?? c.valor)), 0);

    const resumo = [
      { "Métrica": "Total a Pagar", "Valor": formatCurrency(totalAPagar) },
      { "Métrica": "Total Pago", "Valor": formatCurrency(totalPago) },
      { "Métrica": "Saldo", "Valor": formatCurrency(totalAPagar - totalPago) },
      { "Métrica": "Qtd. Lançamentos", "Valor": String(contas.length) },
    ];
    const wsResumo = XLSX.utils.json_to_sheet(resumo);
    wsResumo["!cols"] = [{ wch: 20 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = mes
      ? `contas_${MESES[mes - 1]}_${ano}.xlsx`
      : `contas_${ano}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ error: "Erro ao exportar" });
  }
});

exportRouter.get("/api/export/pdf", async (req, res) => {
  try {
    const ano = req.query.ano ? parseInt(String(req.query.ano)) : new Date().getFullYear();
    const mes = req.query.mes ? parseInt(String(req.query.mes)) : undefined;
    const filtroTipo = req.query.tipo ? String(req.query.tipo) : undefined;
    const filtroStatus = req.query.status ? String(req.query.status) : undefined;
    const filtroVinculo = req.query.vinculo ? String(req.query.vinculo) : undefined;
    const filtroCategoria = req.query.categoria ? String(req.query.categoria) : undefined;

    let contas = mes
      ? await listarContas({ mes, ano })
      : await listarTodasContas(ano);

    if (filtroTipo) contas = contas.filter(c => (c as any).tipo === filtroTipo);
    if (filtroStatus) contas = contas.filter(c => c.status === filtroStatus);
    if (filtroVinculo) contas = contas.filter(c => c.vinculo === filtroVinculo);
    if (filtroCategoria) contas = contas.filter(c => c.categoria === filtroCategoria);

    const totalValor = contas.reduce((acc, c) => acc + parseFloat(String(c.valor)), 0);
    const totalPago = contas.filter(c => c.status === "PAGO").reduce((acc, c) => acc + parseFloat(String(c.valorPago ?? c.valor)), 0);
    const totalPendente = contas.filter(c => c.status !== "PAGO").reduce((acc, c) => acc + parseFloat(String(c.valor)), 0);

    const titulo = mes ? `${MESES[mes - 1]} ${ano}` : `Anual ${ano}`;

    const filtrosAtivos: string[] = [];
    if (filtroTipo) filtrosAtivos.push(filtroTipo === "RECEITA" ? "Receitas" : "Despesas");
    if (filtroStatus) filtrosAtivos.push({ PAGO: "Pagos", PENDENTE: "Pendentes", ATRASADO: "Atrasados" }[filtroStatus] ?? filtroStatus);
    if (filtroVinculo) filtrosAtivos.push(filtroVinculo);
    if (filtroCategoria) filtrosAtivos.push(CATEGORIAS[filtroCategoria] ?? filtroCategoria);
    const filtrosStr = filtrosAtivos.length > 0 ? ` · Filtros: ${filtrosAtivos.join(", ")}` : "";

    const statusLabel: Record<string, string> = { PAGO: "Pago", PENDENTE: "Pendente", ATRASADO: "Atrasado" };

    const rows = contas.map(c => `
      <tr>
        <td>${MESES[c.mes - 1]}</td>
        <td>${c.descricao}</td>
        <td>${formatDate(c.dataVencimento)}</td>
        <td style="text-align:right">R$ ${formatCurrency(c.valor)}</td>
        <td><span class="status status-${c.status.toLowerCase()}">${statusLabel[c.status] ?? c.status}</span></td>
        <td>${CATEGORIAS[c.categoria] ?? c.categoria}</td>
        <td>${c.vinculo}</td>
        <td style="text-align:right">${c.valorPago ? "R$ " + formatCurrency(c.valorPago) : "-"}</td>
      </tr>
    `).join("");

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Contas a Pagar - ${titulo}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; color: #333; margin: 20px; }
  h1 { font-size: 18px; color: #1a2744; margin-bottom: 4px; }
  .subtitle { color: #666; font-size: 12px; margin-bottom: 4px; }
  .filtros { display: inline-flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
  .filtro-tag { background: #e8edf7; color: #1a2744; border-radius: 20px; padding: 2px 10px; font-size: 10px; font-weight: 600; }
  .metricas { display: flex; gap: 16px; margin-bottom: 20px; }
  .metrica { background: #f5f7fa; border-radius: 8px; padding: 12px 16px; flex: 1; }
  .metrica label { font-size: 10px; color: #888; text-transform: uppercase; display: block; }
  .metrica span { font-size: 16px; font-weight: bold; color: #1a2744; }
  .metrica.verde span { color: #065f46; }
  .metrica.amarelo span { color: #92400e; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1a2744; color: white; padding: 8px 6px; text-align: left; font-size: 10px; }
  td { padding: 6px; border-bottom: 1px solid #eee; font-size: 10px; }
  tr:nth-child(even) td { background: #f9f9f9; }
  .status { padding: 2px 6px; border-radius: 10px; font-size: 9px; font-weight: bold; }
  .status-pago { background: #d1fae5; color: #065f46; }
  .status-pendente { background: #fef3c7; color: #92400e; }
  .status-atrasado { background: #fee2e2; color: #991b1b; }
  .footer { margin-top: 16px; font-size: 10px; color: #999; text-align: right; }
  @media print { body { margin: 10px; } }
</style>
</head>
<body>
  <h1>Contas a Pagar</h1>
  <p class="subtitle">Período: ${titulo} · Gerado em ${new Date().toLocaleDateString("pt-BR")}</p>
  ${filtrosAtivos.length > 0 ? `<div class="filtros">${filtrosAtivos.map(f => `<span class="filtro-tag">${f}</span>`).join("")}</div>` : ""}
  <div class="metricas">
    <div class="metrica"><label>Total</label><span>R$ ${formatCurrency(totalValor)}</span></div>
    <div class="metrica verde"><label>Total Pago</label><span>R$ ${formatCurrency(totalPago)}</span></div>
    <div class="metrica amarelo"><label>A Pagar / Pendente</label><span>R$ ${formatCurrency(totalPendente)}</span></div>
    <div class="metrica"><label>Lançamentos</label><span>${contas.length}</span></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Mês</th><th>Descrição</th><th>Vencimento</th><th>Valor</th>
        <th>Status</th><th>Categoria</th><th>Vínculo</th><th>Valor Pago</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">Contas a Pagar · ${new Date().toLocaleString("pt-BR")}</div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    console.error("PDF export error:", err);
    res.status(500).json({ error: "Erro ao exportar" });
  }
});
