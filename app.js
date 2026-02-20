/* ===== TG AGRO PRO - app.js ===== */
/* 1 arroba = 30 kg | Moeda: R$ */

const KG_POR_ARROBA = 30;

// ======== NAVIGATION ========
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');

  const titles = {
    dashboard: 'Dashboard', lotes: 'Lotes', animais: 'Animais',
    pesagens: 'Pesagens', vendas: 'Vendas', custos: 'Custos', financeiro: 'Financeiro'
  };
  document.getElementById('pageTitle').textContent = titles[page] || page;

  const loaders = {
    dashboard: loadDashboard, lotes: loadLotes, animais: loadAnimais,
    pesagens: loadPesagens, vendas: loadVendas, custos: loadCustos, financeiro: loadFinanceiro
  };
  if (loaders[page]) loaders[page]();
}

// ======== UTILS ========
function toArroba(kg) { return (kg / KG_POR_ARROBA).toFixed(2); }
function fmtBRL(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtKg(v) { return Number(v || 0).toLocaleString('pt-BR') + ' kg'; }
function fmtDate(d) { if (!d) return '—'; return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR'); }

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.className = 'toast', 2800);
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function openSetup() { openModal('modalSetup'); }

// ======== API ========
async function api(endpoint, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/.netlify/functions/${endpoint}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

// ======== SETUP ========
async function runSetup() {
  const url = document.getElementById('setupDbUrl').value.trim();
  const msg = document.getElementById('setupMsg');
  msg.className = 'setup-msg';
  msg.textContent = '';
  if (!url) { msg.className = 'setup-msg err'; msg.textContent = 'Informe a DATABASE_URL'; return; }
  try {
    const r = await fetch('/.netlify/functions/setup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbUrl: url })
    });
    const d = await r.json();
    if (r.ok) {
      msg.className = 'setup-msg ok';
      msg.textContent = '✅ Banco inicializado com sucesso!';
      localStorage.setItem('tgagro_db', url);
    } else {
      msg.className = 'setup-msg err';
      msg.textContent = '❌ ' + (d.error || 'Erro');
    }
  } catch (e) {
    msg.className = 'setup-msg err';
    msg.textContent = '❌ ' + e.message;
  }
}

// ======== DASHBOARD ========
async function loadDashboard() {
  try {
    const [lotes, animais, pesagens, vendas, custos] = await Promise.all([
      api('lotes'), api('animais'), api('pesagens'), api('vendas'), api('custos')
    ]);

    const totalAnimais = animais.length;
    const lotesAtivos = lotes.filter(l => l.status === 'ativo').length;

    // Peso total: soma última pesagem de cada animal
    let pesoTotal = 0;
    animais.forEach(a => {
      const p = pesagens.filter(p => p.animal_id == a.id).sort((x, y) => new Date(y.data_pesagem) - new Date(x.data_pesagem));
      if (p.length) pesoTotal += Number(p[0].peso_kg);
      else pesoTotal += Number(a.peso_entrada_kg || 0);
    });

    const receita = vendas.reduce((s, v) => s + Number(v.valor_total || 0), 0);
    const custo = custos.reduce((s, c) => s + Number(c.valor || 0), 0);
    const lucro = receita - custo;

    document.getElementById('totalAnimais').textContent = totalAnimais;
    document.getElementById('pesoTotal').textContent = pesoTotal.toLocaleString('pt-BR') + ' kg';
    document.getElementById('receitaTotal').textContent = fmtBRL(receita);
    document.getElementById('custosTotal').textContent = fmtBRL(custo);
    document.getElementById('lucroTotal').textContent = fmtBRL(lucro);
    document.getElementById('lotesAtivos').textContent = lotesAtivos;

    // Tabela por lote
    const tbody = document.getElementById('dashLotesTbody');
    if (!lotes.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty">Nenhum lote cadastrado.</td></tr>'; return; }
    tbody.innerHTML = lotes.map(l => {
      const animaisLote = animais.filter(a => a.lote_id == l.id);
      let pesosMedio = 0;
      let pesosCount = 0;
      let gmdArr = [];
      animaisLote.forEach(a => {
        const ps = pesagens.filter(p => p.animal_id == a.id).sort((x, y) => new Date(x.data_pesagem) - new Date(y.data_pesagem));
        if (ps.length) {
          pesosMedio += Number(ps[ps.length - 1].peso_kg);
          pesosCount++;
          if (ps.length >= 2) {
            const diff = (new Date(ps[ps.length-1].data_pesagem) - new Date(ps[0].data_pesagem)) / 86400000;
            if (diff > 0) gmdArr.push((Number(ps[ps.length-1].peso_kg) - Number(ps[0].peso_kg)) / diff);
          }
        } else if (a.peso_entrada_kg) {
          pesosMedio += Number(a.peso_entrada_kg);
          pesosCount++;
        }
      });
      const pesoMedio = pesosCount ? pesosMedio / pesosCount : 0;
      const gmd = gmdArr.length ? (gmdArr.reduce((a,b) => a+b, 0) / gmdArr.length) : 0;
      return `<tr>
        <td><strong>${l.nome}</strong></td>
        <td>${animaisLote.length}</td>
        <td>${pesoMedio ? pesoMedio.toFixed(1) + ' kg' : '—'}</td>
        <td>${pesoMedio ? toArroba(pesoMedio) + ' @' : '—'}</td>
        <td>${gmd ? gmd.toFixed(3) + ' kg/dia' : '—'}</td>
        <td><span class="badge ${l.status === 'ativo' ? 'badge-green' : 'badge-red'}">${l.status}</span></td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error(e);
  }
}

// ======== LOTES ========
async function loadLotes() {
  try {
    const lotes = await api('lotes');
    const tbody = document.getElementById('lotesTbody');
    if (!lotes.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty">Nenhum lote cadastrado.</td></tr>'; return; }
    tbody.innerHTML = lotes.map(l => `<tr>
      <td><strong>${l.nome}</strong></td>
      <td>${l.raca || '—'}</td>
      <td>${l.finalidade || '—'}</td>
      <td>${fmtDate(l.data_entrada)}</td>
      <td>${l.area_ha ? l.area_ha + ' ha' : '—'}</td>
      <td><span class="badge ${l.status === 'ativo' ? 'badge-green' : 'badge-red'}">${l.status}</span></td>
      <td>
        <button class="btn-icon" onclick="editLote(${l.id})">✏️ Editar</button>
        <button class="btn-icon btn-danger" onclick="deleteLote(${l.id})">🗑️</button>
      </td>
    </tr>`).join('');
  } catch (e) { showToast('Erro ao carregar lotes', 'error'); }
}

function openModalLote() {
  document.getElementById('loteId').value = '';
  document.getElementById('modalLoteTitle').textContent = 'Novo Lote';
  ['loteNome','loteRaca','loteArea','loteObs'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('loteFinalidade').value = 'corte';
  document.getElementById('loteStatus').value = 'ativo';
  document.getElementById('loteDataEntrada').value = new Date().toISOString().split('T')[0];
  openModal('modalLote');
}

async function editLote(id) {
  try {
    const lotes = await api('lotes');
    const l = lotes.find(x => x.id == id);
    if (!l) return;
    document.getElementById('loteId').value = l.id;
    document.getElementById('modalLoteTitle').textContent = 'Editar Lote';
    document.getElementById('loteNome').value = l.nome || '';
    document.getElementById('loteRaca').value = l.raca || '';
    document.getElementById('loteFinalidade').value = l.finalidade || 'corte';
    document.getElementById('loteDataEntrada').value = l.data_entrada ? l.data_entrada.split('T')[0] : '';
    document.getElementById('loteArea').value = l.area_ha || '';
    document.getElementById('loteStatus').value = l.status || 'ativo';
    document.getElementById('loteObs').value = l.observacoes || '';
    openModal('modalLote');
  } catch (e) { showToast('Erro', 'error'); }
}

async function saveLote() {
  const nome = document.getElementById('loteNome').value.trim();
  if (!nome) { showToast('Informe o nome do lote', 'error'); return; }
  const id = document.getElementById('loteId').value;
  const body = {
    nome,
    raca: document.getElementById('loteRaca').value.trim(),
    finalidade: document.getElementById('loteFinalidade').value,
    data_entrada: document.getElementById('loteDataEntrada').value,
    area_ha: document.getElementById('loteArea').value || null,
    status: document.getElementById('loteStatus').value,
    observacoes: document.getElementById('loteObs').value.trim()
  };
  try {
    if (id) await api(`lotes?id=${id}`, 'PUT', body);
    else await api('lotes', 'POST', body);
    closeModal('modalLote');
    showToast(id ? 'Lote atualizado!' : 'Lote cadastrado!');
    loadLotes();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteLote(id) {
  if (!confirm('Excluir este lote?')) return;
  try {
    await api(`lotes?id=${id}`, 'DELETE');
    showToast('Lote excluído!');
    loadLotes();
  } catch (e) { showToast(e.message, 'error'); }
}

// ======== ANIMAIS ========
async function loadAnimais() {
  try {
    const [animais, lotes] = await Promise.all([api('animais'), api('lotes')]);
    // Populate filter
    const filtro = document.getElementById('filtroLoteAnimal');
    const selVal = filtro.value;
    filtro.innerHTML = '<option value="">Todos os lotes</option>' + lotes.map(l => `<option value="${l.id}">${l.nome}</option>`).join('');
    filtro.value = selVal;

    const filtroId = filtro.value;
    const lista = filtroId ? animais.filter(a => a.lote_id == filtroId) : animais;
    const tbody = document.getElementById('animaisTbody');
    if (!lista.length) { tbody.innerHTML = '<tr><td colspan="9" class="empty">Nenhum animal encontrado.</td></tr>'; return; }
    tbody.innerHTML = lista.map(a => {
      const lote = lotes.find(l => l.id == a.lote_id);
      return `<tr>
        <td><strong>${a.brinco}</strong></td>
        <td>${lote ? lote.nome : '—'}</td>
        <td>${a.raca || '—'}</td>
        <td>${a.sexo || '—'}</td>
        <td>${a.peso_entrada_kg ? a.peso_entrada_kg + ' kg' : '—'}</td>
        <td>${a.peso_entrada_kg ? toArroba(a.peso_entrada_kg) + ' @' : '—'}</td>
        <td>${fmtDate(a.data_entrada)}</td>
        <td>${a.valor_compra ? fmtBRL(a.valor_compra) : '—'}</td>
        <td>
          <button class="btn-icon" onclick="editAnimal(${a.id})">✏️</button>
          <button class="btn-icon btn-danger" onclick="deleteAnimal(${a.id})">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  } catch (e) { showToast('Erro ao carregar animais', 'error'); }
}

async function openModalAnimal() {
  const lotes = await api('lotes');
  document.getElementById('animalId').value = '';
  document.getElementById('modalAnimalTitle').textContent = 'Novo Animal';
  ['animalBrinco','animalRaca','animalPesoEntrada','animalArrobaEntrada','animalValorCompra','animalObs'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('animalSexo').value = 'macho';
  document.getElementById('animalDataEntrada').value = new Date().toISOString().split('T')[0];
  document.getElementById('animalLote').innerHTML = lotes.map(l => `<option value="${l.id}">${l.nome}</option>`).join('');
  openModal('modalAnimal');
}

async function editAnimal(id) {
  const [animais, lotes] = await Promise.all([api('animais'), api('lotes')]);
  const a = animais.find(x => x.id == id);
  if (!a) return;
  document.getElementById('animalId').value = a.id;
  document.getElementById('modalAnimalTitle').textContent = 'Editar Animal';
  document.getElementById('animalBrinco').value = a.brinco || '';
  document.getElementById('animalLote').innerHTML = lotes.map(l => `<option value="${l.id}" ${l.id == a.lote_id ? 'selected' : ''}>${l.nome}</option>`).join('');
  document.getElementById('animalRaca').value = a.raca || '';
  document.getElementById('animalSexo').value = a.sexo || 'macho';
  document.getElementById('animalPesoEntrada').value = a.peso_entrada_kg || '';
  document.getElementById('animalArrobaEntrada').value = a.peso_entrada_kg ? toArroba(a.peso_entrada_kg) + ' @' : '';
  document.getElementById('animalDataEntrada').value = a.data_entrada ? a.data_entrada.split('T')[0] : '';
  document.getElementById('animalValorCompra').value = a.valor_compra || '';
  document.getElementById('animalObs').value = a.observacoes || '';
  openModal('modalAnimal');
}

function calcArrobaEntrada() {
  const kg = parseFloat(document.getElementById('animalPesoEntrada').value);
  document.getElementById('animalArrobaEntrada').value = kg ? toArroba(kg) + ' @' : '';
}

async function saveAnimal() {
  const brinco = document.getElementById('animalBrinco').value.trim();
  const lote = document.getElementById('animalLote').value;
  const peso = document.getElementById('animalPesoEntrada').value;
  if (!brinco || !lote || !peso) { showToast('Preencha os campos obrigatórios', 'error'); return; }
  const id = document.getElementById('animalId').value;
  const body = {
    brinco,
    lote_id: lote,
    raca: document.getElementById('animalRaca').value.trim(),
    sexo: document.getElementById('animalSexo').value,
    peso_entrada_kg: peso,
    data_entrada: document.getElementById('animalDataEntrada').value,
    valor_compra: document.getElementById('animalValorCompra').value || null,
    observacoes: document.getElementById('animalObs').value.trim()
  };
  try {
    if (id) await api(`animais?id=${id}`, 'PUT', body);
    else await api('animais', 'POST', body);
    closeModal('modalAnimal');
    showToast(id ? 'Animal atualizado!' : 'Animal cadastrado!');
    loadAnimais();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteAnimal(id) {
  if (!confirm('Excluir este animal?')) return;
  try {
    await api(`animais?id=${id}`, 'DELETE');
    showToast('Animal excluído!');
    loadAnimais();
  } catch (e) { showToast(e.message, 'error'); }
}

// ======== PESAGENS ========
async function loadPesagens() {
  try {
    const [pesagens, animais, lotes] = await Promise.all([api('pesagens'), api('animais'), api('lotes')]);
    const filtroLote = document.getElementById('filtroLotePesagem');
    const selVal = filtroLote.value;
    filtroLote.innerHTML = '<option value="">Todos os lotes</option>' + lotes.map(l => `<option value="${l.id}">${l.nome}</option>`).join('');
    filtroLote.value = selVal;

    const filtroId = filtroLote.value;
    const lista = filtroId
      ? pesagens.filter(p => { const a = animais.find(x => x.id == p.animal_id); return a && a.lote_id == filtroId; })
      : pesagens;

    const tbody = document.getElementById('pesagensTbody');
    if (!lista.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty">Nenhuma pesagem encontrada.</td></tr>'; return; }
    tbody.innerHTML = lista.sort((a,b) => new Date(b.data_pesagem) - new Date(a.data_pesagem)).map(p => {
      const animal = animais.find(a => a.id == p.animal_id);
      const lote = animal ? lotes.find(l => l.id == animal.lote_id) : null;
      // GMD: comparar com peso de entrada ou pesagem anterior
      let gmd = '—';
      if (animal) {
        const allP = pesagens.filter(x => x.animal_id == animal.id).sort((a,b) => new Date(a.data_pesagem) - new Date(b.data_pesagem));
        const idx = allP.findIndex(x => x.id == p.id);
        if (idx > 0) {
          const prev = allP[idx - 1];
          const dias = (new Date(p.data_pesagem) - new Date(prev.data_pesagem)) / 86400000;
          if (dias > 0) gmd = ((Number(p.peso_kg) - Number(prev.peso_kg)) / dias).toFixed(3) + ' kg/dia';
        } else if (animal.peso_entrada_kg && animal.data_entrada) {
          const dias = (new Date(p.data_pesagem) - new Date(animal.data_entrada)) / 86400000;
          if (dias > 0) gmd = ((Number(p.peso_kg) - Number(animal.peso_entrada_kg)) / dias).toFixed(3) + ' kg/dia';
        }
      }
      return `<tr>
        <td><strong>${animal ? animal.brinco : '—'}</strong></td>
        <td>${lote ? lote.nome : '—'}</td>
        <td>${fmtDate(p.data_pesagem)}</td>
        <td>${p.peso_kg} kg</td>
        <td>${toArroba(p.peso_kg)} @</td>
        <td>${gmd}</td>
        <td>
          <button class="btn-icon btn-danger" onclick="deletePesagem(${p.id})">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  } catch (e) { showToast('Erro ao carregar pesagens', 'error'); }
}

async function openModalPesagem() {
  const animais = await api('animais');
  document.getElementById('pesagemId').value = '';
  document.getElementById('pesagemPeso').value = '';
  document.getElementById('pesagemArroba').value = '';
  document.getElementById('pesagemObs').value = '';
  document.getElementById('pesagemData').value = new Date().toISOString().split('T')[0];
  document.getElementById('pesagemAnimal').innerHTML = animais.map(a => `<option value="${a.id}">${a.brinco}</option>`).join('');
  openModal('modalPesagem');
}

function calcArrobaPesagem() {
  const kg = parseFloat(document.getElementById('pesagemPeso').value);
  document.getElementById('pesagemArroba').value = kg ? toArroba(kg) + ' @' : '';
}

async function savePesagem() {
  const animal_id = document.getElementById('pesagemAnimal').value;
  const data = document.getElementById('pesagemData').value;
  const peso = document.getElementById('pesagemPeso').value;
  if (!animal_id || !data || !peso) { showToast('Preencha os campos obrigatórios', 'error'); return; }
  try {
    await api('pesagens', 'POST', { animal_id, data_pesagem: data, peso_kg: peso, observacoes: document.getElementById('pesagemObs').value });
    closeModal('modalPesagem');
    showToast('Pesagem registrada!');
    loadPesagens();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deletePesagem(id) {
  if (!confirm('Excluir esta pesagem?')) return;
  try {
    await api(`pesagens?id=${id}`, 'DELETE');
    showToast('Pesagem excluída!');
    loadPesagens();
  } catch (e) { showToast(e.message, 'error'); }
}

// ======== VENDAS ========
async function loadVendas() {
  try {
    const [vendas, animais, lotes] = await Promise.all([api('vendas'), api('animais'), api('lotes')]);
    const tbody = document.getElementById('vendasTbody');
    if (!vendas.length) { tbody.innerHTML = '<tr><td colspan="9" class="empty">Nenhuma venda registrada.</td></tr>'; return; }
    tbody.innerHTML = vendas.sort((a,b) => new Date(b.data_venda) - new Date(a.data_venda)).map(v => {
      const animal = animais.find(a => a.id == v.animal_id);
      const lote = animal ? lotes.find(l => l.id == animal.lote_id) : null;
      return `<tr>
        <td>${fmtDate(v.data_venda)}</td>
        <td><strong>${animal ? animal.brinco : '—'}</strong></td>
        <td>${lote ? lote.nome : '—'}</td>
        <td>${v.peso_venda_kg} kg</td>
        <td>${toArroba(v.peso_venda_kg)} @</td>
        <td>${fmtBRL(v.preco_arroba)}</td>
        <td><strong>${fmtBRL(v.valor_total)}</strong></td>
        <td>${v.comprador || '—'}</td>
        <td>
          <button class="btn-icon btn-danger" onclick="deleteVenda(${v.id})">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  } catch (e) { showToast('Erro ao carregar vendas', 'error'); }
}

async function openModalVenda() {
  const animais = await api('animais');
  document.getElementById('vendaId').value = '';
  document.getElementById('vendaPeso').value = '';
  document.getElementById('vendaArroba').value = '';
  document.getElementById('vendaPrecoArroba').value = '';
  document.getElementById('vendaTotal').value = '';
  document.getElementById('vendaComprador').value = '';
  document.getElementById('vendaObs').value = '';
  document.getElementById('vendaData').value = new Date().toISOString().split('T')[0];
  document.getElementById('vendaAnimal').innerHTML = animais.map(a => `<option value="${a.id}">${a.brinco}</option>`).join('');
  openModal('modalVenda');
}

function calcVenda() {
  const kg = parseFloat(document.getElementById('vendaPeso').value);
  const preco = parseFloat(document.getElementById('vendaPrecoArroba').value);
  if (kg) document.getElementById('vendaArroba').value = toArroba(kg) + ' @';
  if (kg && preco) document.getElementById('vendaTotal').value = fmtBRL((kg / KG_POR_ARROBA) * preco);
}

async function saveVenda() {
  const animal_id = document.getElementById('vendaAnimal').value;
  const data = document.getElementById('vendaData').value;
  const peso = document.getElementById('vendaPeso').value;
  const preco = document.getElementById('vendaPrecoArroba').value;
  if (!animal_id || !data || !peso || !preco) { showToast('Preencha os campos obrigatórios', 'error'); return; }
  const valor_total = (parseFloat(peso) / KG_POR_ARROBA) * parseFloat(preco);
  try {
    await api('vendas', 'POST', {
      animal_id, data_venda: data, peso_venda_kg: peso,
      preco_arroba: preco, valor_total,
      comprador: document.getElementById('vendaComprador').value,
      observacoes: document.getElementById('vendaObs').value
    });
    closeModal('modalVenda');
    showToast('Venda registrada!');
    loadVendas();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteVenda(id) {
  if (!confirm('Excluir esta venda?')) return;
  try {
    await api(`vendas?id=${id}`, 'DELETE');
    showToast('Venda excluída!');
    loadVendas();
  } catch (e) { showToast(e.message, 'error'); }
}

// ======== CUSTOS ========
const catLabels = {
  alimentacao: '🌾 Alimentação', saude: '💉 Saúde/Vet', mao_de_obra: '👷 Mão de Obra',
  infraestrutura: '🏗️ Infraestrutura', transporte: '🚛 Transporte', outros: '📦 Outros'
};

async function loadCustos() {
  try {
    const [custos, lotes] = await Promise.all([api('custos'), api('lotes')]);
    const filtro = document.getElementById('filtroCategoriaCusto').value;
    const lista = filtro ? custos.filter(c => c.categoria === filtro) : custos;
    const tbody = document.getElementById('custosTbody');
    if (!lista.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty">Nenhum custo encontrado.</td></tr>'; return; }
    tbody.innerHTML = lista.sort((a,b) => new Date(b.data_custo) - new Date(a.data_custo)).map(c => {
      const lote = lotes.find(l => l.id == c.lote_id);
      return `<tr>
        <td>${fmtDate(c.data_custo)}</td>
        <td>${c.descricao}</td>
        <td>${catLabels[c.categoria] || c.categoria}</td>
        <td>${lote ? lote.nome : 'Geral'}</td>
        <td><strong>${fmtBRL(c.valor)}</strong></td>
        <td>
          <button class="btn-icon btn-danger" onclick="deleteCusto(${c.id})">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  } catch (e) { showToast('Erro ao carregar custos', 'error'); }
}

async function openModalCusto() {
  const lotes = await api('lotes');
  document.getElementById('custoId').value = '';
  document.getElementById('custoDescricao').value = '';
  document.getElementById('custoValor').value = '';
  document.getElementById('custoObs').value = '';
  document.getElementById('custoData').value = new Date().toISOString().split('T')[0];
  document.getElementById('custoCategoria').value = 'alimentacao';
  document.getElementById('custoLote').innerHTML = '<option value="">Geral</option>' + lotes.map(l => `<option value="${l.id}">${l.nome}</option>`).join('');
  openModal('modalCusto');
}

async function saveCusto() {
  const desc = document.getElementById('custoDescricao').value.trim();
  const valor = document.getElementById('custoValor').value;
  const data = document.getElementById('custoData').value;
  if (!desc || !valor || !data) { showToast('Preencha os campos obrigatórios', 'error'); return; }
  try {
    await api('custos', 'POST', {
      descricao: desc,
      categoria: document.getElementById('custoCategoria').value,
      lote_id: document.getElementById('custoLote').value || null,
      data_custo: data,
      valor,
      observacoes: document.getElementById('custoObs').value
    });
    closeModal('modalCusto');
    showToast('Custo registrado!');
    loadCustos();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteCusto(id) {
  if (!confirm('Excluir este custo?')) return;
  try {
    await api(`custos?id=${id}`, 'DELETE');
    showToast('Custo excluído!');
    loadCustos();
  } catch (e) { showToast(e.message, 'error'); }
}

// ======== FINANCEIRO ========
async function loadFinanceiro() {
  try {
    const [vendas, custos, lotes] = await Promise.all([api('vendas'), api('custos'), api('lotes'), api('animais')]);
    const [, animais] = await Promise.all([Promise.resolve(), api('animais')]);

    const totalReceita = vendas.reduce((s, v) => s + Number(v.valor_total || 0), 0);
    const totalCusto = custos.reduce((s, c) => s + Number(c.valor || 0), 0);
    const lucro = totalReceita - totalCusto;
    const margem = totalReceita ? ((lucro / totalReceita) * 100) : 0;

    document.getElementById('finReceitas').textContent = fmtBRL(totalReceita);
    document.getElementById('finCustos').textContent = fmtBRL(totalCusto);
    document.getElementById('finLucro').textContent = fmtBRL(lucro);
    document.getElementById('finLucro').className = 'fin-value ' + (lucro >= 0 ? 'green' : 'red');
    document.getElementById('finMargem').textContent = margem.toFixed(1) + '%';
    document.getElementById('finMargem').className = 'fin-value ' + (margem >= 0 ? 'green' : 'red');

    // Por lote
    const tbody = document.getElementById('finLotesTbody');
    tbody.innerHTML = lotes.map(l => {
      const animaisLote = animais.filter(a => a.lote_id == l.id).map(a => a.id);
      const rec = vendas.filter(v => animaisLote.includes(v.animal_id)).reduce((s, v) => s + Number(v.valor_total || 0), 0);
      const cst = custos.filter(c => c.lote_id == l.id).reduce((s, c) => s + Number(c.valor || 0), 0);
      const lc = rec - cst;
      const mg = rec ? ((lc / rec) * 100).toFixed(1) : '—';
      return `<tr>
        <td><strong>${l.nome}</strong></td>
        <td class="${rec > 0 ? 'green' : ''}">${fmtBRL(rec)}</td>
        <td class="${cst > 0 ? 'red' : ''}">${fmtBRL(cst)}</td>
        <td class="${lc >= 0 ? 'green' : 'red'}">${fmtBRL(lc)}</td>
        <td class="${lc >= 0 ? 'green' : 'red'}">${mg !== '—' ? mg + '%' : '—'}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" class="empty">Sem dados.</td></tr>';

    // Por categoria
    const tbodyCat = document.getElementById('finCategoriasTbody');
    const cats = {};
    custos.forEach(c => { cats[c.categoria] = (cats[c.categoria] || 0) + Number(c.valor || 0); });
    tbodyCat.innerHTML = Object.entries(cats).sort((a,b) => b[1]-a[1]).map(([cat, val]) => `<tr>
      <td>${catLabels[cat] || cat}</td>
      <td>${fmtBRL(val)}</td>
      <td>${totalCusto ? ((val/totalCusto)*100).toFixed(1) + '%' : '—'}</td>
    </tr>`).join('') || '<tr><td colspan="3" class="empty">Sem custos registrados.</td></tr>';

  } catch (e) { showToast('Erro ao carregar financeiro', 'error'); }
}

// ======== INIT ========
window.addEventListener('DOMContentLoaded', () => {
  // Set date
  document.getElementById('topbarDate').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
  });

  loadDashboard();
});

// Add green/red color to table cells
document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = '.green { color: var(--green) !important; } .red { color: var(--red) !important; }';
  document.head.appendChild(style);
});
