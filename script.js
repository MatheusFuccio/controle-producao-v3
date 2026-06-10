const estado = {
  dados: [],
  filtrados: []
};

const elementos = {
  tabela: document.getElementById('tabelaOSs'),
  busca: document.getElementById('busca'),
  filtroStatus: document.getElementById('filtroStatus'),
  filtroPrazo: document.getElementById('filtroPrazo'),
  ordenacao: document.getElementById('ordenacao'),
  totalOss: document.getElementById('totalOss'),
  emProducao: document.getElementById('emProducao'),
  atrasadas: document.getElementById('atrasadas'),
  entregaSemana: document.getElementById('entregaSemana'),
  liberadoFaturamento: document.getElementById('liberadoFaturamento'),
  contadorFiltrado: document.getElementById('contadorFiltrado'),
  dataAtualizacao: document.getElementById('dataAtualizacao'),
  alerta: document.getElementById('alerta'),
  btnLimparFiltros: document.getElementById('btnLimparFiltros'),
  btnExportarCsv: document.getElementById('btnExportarCsv'),
  modal: document.getElementById('modalOS'),
  modalTitulo: document.getElementById('modalTitulo'),
  modalConteudo: document.getElementById('modalConteudo'),
  fecharModal: document.getElementById('fecharModal')
};

iniciar();

async function iniciar(){
  try{
    const resposta = await fetch(`dados.csv?v=${Date.now()}`);
    if(!resposta.ok) throw new Error('Não foi possível localizar o arquivo dados.csv');
    const texto = await resposta.text();
    estado.dados = normalizarDados(parseCSV(texto));
    preencherFiltroStatus();
    aplicarFiltros();
    elementos.dataAtualizacao.textContent = `Atualizado em ${new Date().toLocaleString('pt-BR')}`;
  }catch(erro){
    elementos.alerta.classList.remove('hidden');
    elementos.alerta.textContent = `Erro ao carregar os dados: ${erro.message}. Confira se o arquivo dados.csv está na raiz do projeto.`;
  }
}

function parseCSV(texto){
  const limpo = texto.replace(/^\uFEFF/, '').trim();
  if(!limpo) return [];

  const linhas = limpo.split(/\r?\n/).filter(Boolean);
  const cabecalhos = separarLinhaCSV(linhas.shift()).map(normalizarCabecalho);

  return linhas.map(linha => {
    const valores = separarLinhaCSV(linha);
    return cabecalhos.reduce((obj, chave, indice) => {
      obj[chave] = (valores[indice] || '').trim();
      return obj;
    }, {});
  });
}

function separarLinhaCSV(linha){
  const resultado = [];
  let atual = '';
  let dentroDeAspas = false;

  for(let i = 0; i < linha.length; i++){
    const caractere = linha[i];
    const proximo = linha[i + 1];

    if(caractere === '"' && dentroDeAspas && proximo === '"'){
      atual += '"';
      i++;
    }else if(caractere === '"'){
      dentroDeAspas = !dentroDeAspas;
    }else if(caractere === ';' && !dentroDeAspas){
      resultado.push(atual);
      atual = '';
    }else{
      atual += caractere;
    }
  }
  resultado.push(atual);
  return resultado;
}

function normalizarCabecalho(valor){
  return valor
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function normalizarStatus(valor){
  return String(valor || '')
    .trim()
    .toUpperCase()
    .replace('LIBERADO EXPEDIÇÃO', 'LIBERADO FATURAMENTO')
    .replace('LIBERADO EXPEDICAO', 'LIBERADO FATURAMENTO');
}

function normalizarDados(linhas){
  return linhas.map((linha, indice) => {
    const item = {
      id: indice + 1,
      os: linha.os || linha.op || '',
      cliente: linha.cliente || '',
      produto: linha.produto || linha.equipamento || '',
      qtde: linha.qtde || linha.quantidade || '',
      lancamento: linha.lancamento || linha.entrada || '',
      entrega: linha.entrega || linha.prazo || '',
      status: normalizarStatus(linha.status || 'SEM STATUS'),
      observacao: linha.observacao_da_ultima_reuniao_semanal || linha.observacao || linha.obs || '',
      responsavel: linha.responsavel || linha.tecnico || linha.setor || '',
      prioridade: linha.prioridade || '',
      valor: linha.valor || ''
    };

    item.dataEntrega = parseDataBR(item.entrega);
    item.dataLancamento = parseDataBR(item.lancamento);
    item.situacaoPrazo = calcularSituacaoPrazo(item);
    item.diasPrazo = calcularDiasPrazo(item.dataEntrega);
    return item;
  });
}

function parseDataBR(valor){
  const partes = String(valor).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(!partes) return null;
  const [, dia, mes, ano] = partes;
  return new Date(Number(ano), Number(mes) - 1, Number(dia));
}

function hojeSemHora(){
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
}

function calcularDiasPrazo(data){
  if(!data) return null;
  return Math.ceil((data - hojeSemHora()) / 86400000);
}

function calcularSituacaoPrazo(item){
  if(item.status.includes('CONCLU')) return 'CONCLUIDA';
  const dias = calcularDiasPrazo(item.dataEntrega);
  if(dias === null) return 'SEM_DATA';
  if(dias < 0) return 'ATRASADA';
  if(dias <= 7) return '7_DIAS';
  return 'NO_PRAZO';
}

function preencherFiltroStatus(){
  const status = [...new Set(estado.dados.map(item => item.status))].sort();
  elementos.filtroStatus.innerHTML = '<option value="">Todos</option>' +
    status.map(valor => `<option value="${escapeHTML(valor)}">${escapeHTML(formatarStatus(valor))}</option>`).join('');
}

function aplicarFiltros(){
  const termo = elementos.busca.value.trim().toLowerCase();
  const status = elementos.filtroStatus.value;
  const prazo = elementos.filtroPrazo.value;

  estado.filtrados = estado.dados.filter(item => {
    const textoBusca = [item.os, item.cliente, item.produto, item.qtde, item.status, item.observacao, item.responsavel, item.prioridade]
      .join(' ')
      .toLowerCase();

    const bateBusca = !termo || textoBusca.includes(termo);
    const bateStatus = !status || item.status === status;
    const batePrazo = !prazo || item.situacaoPrazo === prazo;

    return bateBusca && bateStatus && batePrazo;
  });

  ordenarDados();
  atualizarIndicadores();
  renderizarTabela();
  renderizarAlerta();
}

function ordenarDados(){
  const modo = elementos.ordenacao.value;
  estado.filtrados.sort((a,b) => {
    if(modo === 'entrega-desc') return (b.dataEntrega || 0) - (a.dataEntrega || 0);
    if(modo === 'cliente-asc') return a.cliente.localeCompare(b.cliente, 'pt-BR');
    if(modo === 'os-asc') return Number(a.os) - Number(b.os) || String(a.os).localeCompare(String(b.os), 'pt-BR');
    return (a.dataEntrega || new Date(9999,0,1)) - (b.dataEntrega || new Date(9999,0,1));
  });
}

function atualizarIndicadores(){
  const dados = estado.dados;
  elementos.totalOss.textContent = dados.length;
  elementos.emProducao.textContent = dados.filter(x => x.status.includes('PRODU')).length;
  elementos.atrasadas.textContent = dados.filter(x => x.situacaoPrazo === 'ATRASADA').length;
  elementos.entregaSemana.textContent = dados.filter(x => x.situacaoPrazo === '7_DIAS').length;
  elementos.liberadoFaturamento.textContent = dados.filter(x => x.status.includes('LIBERADO FATURAMENTO')).length;
  elementos.contadorFiltrado.textContent = estado.filtrados.length;
}

function renderizarTabela(){
  if(!estado.filtrados.length){
    elementos.tabela.innerHTML = `<tr><td class="empty" colspan="9">Nenhuma OS encontrada para os filtros selecionados.</td></tr>`;
    return;
  }

  elementos.tabela.innerHTML = estado.filtrados.map(item => `
    <tr data-id="${item.id}">
      <td class="os-cell">${escapeHTML(item.os)}</td>
      <td class="cliente-cell">${escapeHTML(item.cliente)}</td>
      <td class="produto-cell">${escapeHTML(item.produto)}</td>
      <td class="qtde-cell">${escapeHTML(item.qtde || '-')}</td>
      <td>${escapeHTML(item.lancamento)}</td>
      <td>${escapeHTML(item.entrega)}</td>
      <td>${badgeStatus(item.status)}</td>
      <td>${badgePrazo(item)}</td>
      <td class="obs-cell" title="${escapeHTML(item.observacao || '-')}">${escapeHTML(resumirTexto(item.observacao || '-', 58))}</td>
    </tr>
  `).join('');

  elementos.tabela.querySelectorAll('tr[data-id]').forEach(linha => {
    linha.addEventListener('click', () => abrirModal(Number(linha.dataset.id)));
  });
}

function renderizarAlerta(){
  const atrasadas = estado.dados.filter(item => item.situacaoPrazo === 'ATRASADA');
  if(!atrasadas.length){
    elementos.alerta.classList.add('hidden');
    return;
  }

  const destaque = atrasadas.slice(0,3).map(item => `OS ${item.os} (${item.cliente})`).join(', ');
  elementos.alerta.classList.remove('hidden');
  elementos.alerta.textContent = `${atrasadas.length} OS(s) atrasada(s). Priorize a verificação de: ${destaque}${atrasadas.length > 3 ? '...' : '.'}`;
}

function badgeStatus(status){
  let classe = 'badge--default';
  if(status.includes('PRODU')) classe = 'badge--producao';
  if(status.includes('REVIS')) classe = 'badge--revisao';
  if(status.includes('CONCLU') || status.includes('LIBERADO FATURAMENTO')) classe = 'badge--concluido';
  return `<span class="badge ${classe}">${escapeHTML(formatarStatus(status))}</span>`;
}

function badgePrazo(item){
  const situacao = item.situacaoPrazo;
  if(situacao === 'CONCLUIDA') return '<span class="prazo prazo--concluida">Concluída</span>';
  if(situacao === 'ATRASADA') return `<span class="prazo prazo--atrasada">Atrasada ${Math.abs(item.diasPrazo)} dia(s)</span>`;
  if(situacao === '7_DIAS') return `<span class="prazo prazo--semana">${item.diasPrazo === 0 ? 'Vence hoje' : `${item.diasPrazo} dia(s)`}</span>`;
  if(situacao === 'NO_PRAZO') return `<span class="prazo prazo--ok">No prazo</span>`;
  return '<span class="prazo prazo--ok">Sem data</span>';
}

function abrirModal(id){
  const item = estado.dados.find(x => x.id === id);
  if(!item) return;

  elementos.modalTitulo.textContent = `OS ${item.os}`;
  elementos.modalConteudo.innerHTML = `
    <div class="detail-grid">
      <div class="detail"><span>Cliente</span><strong>${escapeHTML(item.cliente)}</strong></div>
      <div class="detail"><span>Status</span><strong>${formatarStatus(item.status)}</strong></div>
      <div class="detail detail--wide"><span>Produto / Serviço</span><strong>${escapeHTML(item.produto)}</strong></div>
      <div class="detail"><span>Quantidade</span><strong>${escapeHTML(item.qtde || 'Não informada')}</strong></div>
      <div class="detail"><span>Lançamento</span><strong>${escapeHTML(item.lancamento || '-')}</strong></div>
      <div class="detail"><span>Entrega</span><strong>${escapeHTML(item.entrega || '-')}</strong></div>
      <div class="detail"><span>Situação do prazo</span><strong>${textoPrazo(item)}</strong></div>
      <div class="detail"><span>Responsável / Setor</span><strong>${escapeHTML(item.responsavel || 'Não informado')}</strong></div>
      <div class="detail"><span>Prioridade</span><strong>${escapeHTML(item.prioridade || 'Não informada')}</strong></div>
      <div class="detail"><span>Valor</span><strong>${escapeHTML(item.valor || 'Não informado')}</strong></div>
      <div class="detail detail--wide"><span>Observação da última reunião semanal</span><strong>${escapeHTML(item.observacao || 'Sem observação')}</strong></div>
    </div>
  `;

  elementos.modal.showModal();
}

function textoPrazo(item){
  if(item.situacaoPrazo === 'ATRASADA') return `Atrasada ${Math.abs(item.diasPrazo)} dia(s)`;
  if(item.situacaoPrazo === '7_DIAS') return item.diasPrazo === 0 ? 'Vence hoje' : `Entrega em ${item.diasPrazo} dia(s)`;
  if(item.situacaoPrazo === 'NO_PRAZO') return 'No prazo';
  if(item.situacaoPrazo === 'CONCLUIDA') return 'Concluída';
  return 'Sem data válida';
}

function formatarStatus(status){
  return String(status || '')
    .toLowerCase()
    .replace(/(^|\s)\S/g, letra => letra.toUpperCase());
}

function resumirTexto(valor, limite){
  const texto = String(valor || '').trim();
  if(texto.length <= limite) return texto;
  return `${texto.slice(0, limite).trim()}...`;
}

function escapeHTML(valor){
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function limparFiltros(){
  elementos.busca.value = '';
  elementos.filtroStatus.value = '';
  elementos.filtroPrazo.value = '';
  elementos.ordenacao.value = 'entrega-asc';
  aplicarFiltros();
}

function exportarCsvFiltrado(){
  const cabecalho = ['OS','CLIENTE','PRODUTO','QTDE','LANCAMENTO','ENTREGA','STATUS','SITUACAO_PRAZO','OBSERVACAO'];
  const linhas = estado.filtrados.map(item => [
    item.os,
    item.cliente,
    item.produto,
    item.qtde,
    item.lancamento,
    item.entrega,
    item.status,
    textoPrazo(item),
    item.observacao
  ]);

  const conteudo = [cabecalho, ...linhas]
    .map(linha => linha.map(campo => `"${String(campo).replace(/"/g,'""')}"`).join(';'))
    .join('\n');

  const blob = new Blob([`\uFEFF${conteudo}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pcp-elevolt-filtrado-${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

elementos.busca.addEventListener('input', aplicarFiltros);
elementos.filtroStatus.addEventListener('change', aplicarFiltros);
elementos.filtroPrazo.addEventListener('change', aplicarFiltros);
elementos.ordenacao.addEventListener('change', aplicarFiltros);
elementos.btnLimparFiltros.addEventListener('click', limparFiltros);
elementos.btnExportarCsv.addEventListener('click', exportarCsvFiltrado);
elementos.fecharModal.addEventListener('click', () => elementos.modal.close());
elementos.modal.addEventListener('click', evento => {
  if(evento.target === elementos.modal) elementos.modal.close();
});
