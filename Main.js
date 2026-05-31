const PLANTATION_CORDS = [
    [-45.74539479834294,  -22.36486843537137],
    [-45.744858356539964, -22.365076793180002],
    [-45.74492272955632,  -22.36555303842905],
    [-45.74464377981877,  -22.365860612620057],
    [-45.742819877688646, -22.364957731613238],
    [-45.74329194647527,  -22.363519062968283],
    [-45.74519095045781,  -22.36317179589618],
    [-45.74539479834294,  -22.36486843537137]
];

const LAT  = -22.3648;
const LON  = -45.7453;
const hoje = new Date();
hoje.setDate(hoje.getDate() - 45);
const DATA = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;


const map = L.map('map').setView([LAT, LON], 15);

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Esri'
}).addTo(map);


async function obterDadosCafe(lat, lon, dataInicio) {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    const hoje = new Date().toISOString().split('T')[0];

    url.searchParams.set('latitude',   lat);
    url.searchParams.set('longitude',  lon);
    url.searchParams.set('start_date', dataInicio); // 45 dias atrás
    url.searchParams.set('end_date',   hoje);        // até hoje
    url.searchParams.set('daily',   'temperature_2m_max,temperature_2m_min,precipitation_sum');
    url.searchParams.set('hourly',  'soil_moisture_7_to_28cm');
    url.searchParams.set('timezone', 'America/Sao_Paulo');

    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error('Erro ao buscar clima: ' + resp.status);
    const json = await resp.json();

    // Pega o último dia disponível para temperatura
    const ultimoDia = json.daily.temperature_2m_max.length - 1;

    // Soma a chuva acumulada no período inteiro
    const chuvaTotalPeriodo = json.daily.precipitation_sum
        .reduce((acc, v) => acc + (v ?? 0), 0);

    // Pega a leitura mais recente de umidade do solo
    const soloArr = json.hourly.soil_moisture_7_to_28cm.filter(v => v !== null);
    const umidadeSoloAtual = soloArr.length > 0 ? soloArr[soloArr.length - 1] : null;

    return {
        diario: {
            tempMax:   json.daily.temperature_2m_max[ultimoDia],
            tempMin:   json.daily.temperature_2m_min[ultimoDia],
            somaChuva: chuvaTotalPeriodo
        },
        horario: {
            umidadeSolo: umidadeSoloAtual
        }
    };
}


async function integrarDados() {
    try {
        const response = await fetch('https://meu-api-earthengine.onrender.com/ndvi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plantationCords: PLANTATION_CORDS,
                dataInicio: DATA
            })
        });

        if (!response.ok) throw new Error('API NDVI retornou ' + response.status);
        const dadosProdutor = await response.json();

        console.log('NDVI Médio:', dadosProdutor.mediaNdvi.toFixed(2));

        // Adiciona polígono colorido no mapa
        const ndvi = dadosProdutor.mediaNdvi;
        const cor  = ndvi > 0.6 ? '#2ecc71' : ndvi >= 0.3 ? '#f1c40f' : '#e74c3c';
        const latlngs = PLANTATION_CORDS.map(([lng, lat]) => [lat, lng]);

        L.polygon(latlngs, {
            color: cor, weight: 2,
            fillColor: cor, fillOpacity: 0.35
        }).addTo(map).bindPopup(`NDVI Médio: ${ndvi.toFixed(2)}`);

        // Adiciona tiles NDVI do Earth Engine se existir
        if (dadosProdutor.urlMapa) {
            L.tileLayer(dadosProdutor.urlMapa, { opacity: 0.7, maxZoom: 19 }).addTo(map);
        }

        return dadosProdutor;

    } catch (erro) {
        console.warn('API NDVI indisponível:', erro.message);

        // Mesmo sem NDVI, desenha o polígono em cinza
        const latlngs = PLANTATION_CORDS.map(([lng, lat]) => [lat, lng]);
        L.polygon(latlngs, {
            color: '#8b949e', weight: 2,
            fillColor: '#8b949e', fillOpacity: 0.2,
            dashArray: '6,4'
        }).addTo(map).bindPopup('NDVI indisponível');

        return null;
    }
}

async function mostrarRelatorioClima(dadosProdutor) {
    try {
        const dados = await obterDadosCafe(LAT, LON, DATA);

        const ultimaTempMax    = dados.diario.tempMax;
        const ultimaTempMin    = dados.diario.tempMin;
        const totalChuva       = dados.diario.somaChuva;
        const umidadeSoloAtual = dados.horario.umidadeSolo;

        // --- Monta window.appData para o HTML usar ---
        window.appData = {
            ndvi:  dadosProdutor,
            clima: {
                ultimaTempMax,
                ultimaTempMin,
                totalChuva,
                umidadeSoloAtual
            }
        };

        // --- Diagnóstico combinado NDVI + Clima ---
        const alertaEl = document.getElementById('alerta');

        function criarAlerta(tipo, icone, msg) {
            const div = document.createElement('div');
            div.className = `alerta-item alerta-${tipo}`;
            div.innerHTML = `<span class="alerta-icone">${icone}</span><span>${msg}</span>`;
            alertaEl.appendChild(div);
        }

        if (dadosProdutor) {
            const ndvi      = dadosProdutor.mediaNdvi;
            const ndviOk    = ndvi >= 0.6;
            const ndviBaixo = ndvi < 0.3;
            const umidadeOk    = umidadeSoloAtual >= 0.30;
            const umidadeBaixa = umidadeSoloAtual < 0.20;
            const tempOk   = ultimaTempMin >= 15 && ultimaTempMax <= 32;
            const tempAlta = ultimaTempMax > 35;
            const tempBaixa= ultimaTempMin < 10;
            const chuvaOk  = totalChuva >= 3 && totalChuva <= 50;
            const seco     = totalChuva < 3;
            const excChuva = totalChuva > 50;

            let pontos = 0;
            if (ndviOk)   pontos++;
            if (umidadeOk) pontos++;
            if (tempOk)   pontos++;
            if (chuvaOk)  pontos++;

            // Veredicto principal
            if (pontos === 4) {
                criarAlerta('ok', '✅', 'O café está saudável — todos os indicadores estão dentro do ideal.');
            } else if (pontos === 3) {
                criarAlerta('warn', '⚠️', 'Atenção — um fator está fora do ideal. Monitore de perto.');
                if (!ndviOk)    criarAlerta('warn', '⚠️', 'NDVI abaixo do ideal: verifique pragas ou deficiência nutricional.');
                if (!umidadeOk) criarAlerta('warn', '⚠️', 'Umidade do solo baixa: considere irrigação suplementar.');
                if (!tempOk)    criarAlerta('warn', '⚠️', 'Temperatura fora da faixa ideal para o café.');
                if (!chuvaOk)   criarAlerta('warn', '⚠️', seco ? 'Chuva insuficiente: planeje irrigação.' : 'Excesso de chuva: verifique drenagem e risco de fungos.');
            } else if (pontos === 2) {
                criarAlerta('danger', '🚨', 'Risco moderado — múltiplos fatores comprometidos. Intervenção recomendada.');
                if (!ndviOk)    criarAlerta('danger', '🚨', 'NDVI comprometido: vigor vegetativo em queda.');
                if (!umidadeOk) criarAlerta('danger', '🚨', 'Solo com umidade inadequada.');
                if (!tempOk)    criarAlerta('danger', '🚨', tempAlta ? 'Calor excessivo: risco de queima das folhas.' : 'Frio excessivo: risco de geada.');
                if (!chuvaOk)   criarAlerta('danger', '🚨', seco ? 'Déficit hídrico por falta de chuva.' : 'Risco de doenças fúngicas por excesso de chuva.');
            } else {
                criarAlerta('danger', '🚨', 'Estado crítico — consulte um agrônomo imediatamente.');
                if (ndviBaixo)    criarAlerta('danger', '🚨', 'NDVI muito baixo: possível praga severa ou morte de vegetação.');
                if (umidadeBaixa) criarAlerta('danger', '🚨', 'Solo extremamente seco: irrigação URGENTE.');
                if (tempAlta)     criarAlerta('danger', '🚨', 'Calor extremo: risco de aborto de frutos.');
                if (tempBaixa)    criarAlerta('danger', '🚨', 'Frio extremo: risco de geada e dano irreversível.');
                if (excChuva)     criarAlerta('danger', '🚨', 'Excesso severo de chuva: risco de ferrugem e podridão.');
            }

            // Alerta de solo sempre visível
            if (umidadeSoloAtual < 0.2) {
                criarAlerta('danger', '🚿', 'Solo muito seco! Considere irrigar.');
            } else {
                criarAlerta('ok', '✅', 'Solo com boa umidade.');
            }

        } else {
            criarAlerta('warn', '⚠️', 'NDVI indisponível — diagnóstico baseado apenas nos dados climáticos.');
            if (umidadeSoloAtual < 0.20)      criarAlerta('danger', '🚨', 'Solo muito seco! Irrigação urgente.');
            else if (umidadeSoloAtual < 0.30) criarAlerta('warn',   '⚠️', 'Umidade no limite. Monitore de perto.');
            else                               criarAlerta('ok',     '✅', 'Umidade do solo adequada.');
        }

        // Dispara evento para o HTML atualizar badge e status
        document.dispatchEvent(new Event('appDataReady'));

    } catch (erro) {
        console.error('Erro ao carregar dados climáticos:', erro);
        const alertaEl = document.getElementById('alerta');
        if (alertaEl) {
            alertaEl.innerHTML = `<div class="alerta-item alerta-danger"><span class="alerta-icone">🚨</span><span>Não foi possível carregar os dados climáticos.</span></div>`;
        }
        document.dispatchEvent(new Event('appDataReady'));
    }
}

async function main() {
    const dadosProdutor = await integrarDados();
    await mostrarRelatorioClima(dadosProdutor);
}

main();
