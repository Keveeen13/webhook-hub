require('dotenv').config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 5000;

const {
    KOMMO_API_TOKEN,
    KOMMO_SUBDOMAIN,
    GOOGLE_CHAT_WEBHOOK_URL_CELEBRAR,
    GOOGLE_CHAT_WEBHOOK_URL_PROPOSTA,
    GOOGLE_CHAT_WEBHOOK_URL_CONTRATO
} = process.env;

if (!KOMMO_API_TOKEN || !KOMMO_SUBDOMAIN || !GOOGLE_CHAT_WEBHOOK_URL_CELEBRAR || !GOOGLE_CHAT_WEBHOOK_URL_PROPOSTA || !GOOGLE_CHAT_WEBHOOK_URL_CONTRATO) {
    console.error("Erro: Uma ou mais variáveis de ambiente críticas não foram definidas. Verifique KOMMO_API_TOKEN, KOMMO_SUBDOMAIN e as 3 URLs de webhook.");
    process.exit(1);
}

const STATUS_ID_COMUM_VENDA_GANHA = "142";

const STATUS_RENOVACAO_VENDA_GANHA = {
  "5393333": "56091732", // Aflitos
  "5393324": "56091780", // BV Corporate
  "5393327": "73173224", // Fortaleza
  "6002513": "56084308", // Caruaru
  "5664860": "56084252", // Ilha do Leite
  "6002516": "58058972", // Recife Antigo
  "5363747": "56091804", // Várzea
  "8528920": "69210348", // Petrolina
  "9857964": "76096264", // Teste
};

const ETAPA_PROPOSTA_ENVIADA = "Proposta Enviada";
const ETAPA_EM_CONTRATO = "Em Contrato";

const RESPONSAVEIS = {
    "8535653": "Zíngara Farias",
    "8173676": "Cassya Serpa",
    "8173679": "Dayana Alves",
    "8173685": "Cecilia Mousinho",
    "9640756": "Luiz Assis",
    "11238260": "Giselle Bezerra Benicio",
    "11304156": "Dêivid Flávio Farias dos Santos",
};

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

let etapaMap = {};
let etapasCarregadasComSucesso = false;

async function carregarEtapas() {
    try {
        console.log(`Iniciando carregamento de etapas de https://${KOMMO_SUBDOMAIN}.kommo.com...`);
        const response = await axios.get(
            `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads/pipelines`,
            {
                headers: {
                    Authorization: `Bearer ${KOMMO_API_TOKEN}`,
                },
            }
        );

        const pipelines = response.data?._embedded?.pipelines;
        if (!pipelines) {
            console.error("Erro ao carregar etapas: a estrutura de pipelines não foi encontrada na resposta da API.");
            etapasCarregadasComSucesso = false;
            return;
        }

        const tempEtapaMap = {};
        for (const pipeline of pipelines) {
            if (pipeline._embedded?.statuses) {
                for (const status of pipeline._embedded.statuses) {
                    tempEtapaMap[status.id] = status.name;
                }
            }
        }
        etapaMap = tempEtapaMap;
        etapasCarregadasComSucesso = true;
        console.log("Etapas carregadas com sucesso:", Object.keys(etapaMap).length, "etapas mapeadas.");
    } catch (error) {
        console.error("Erro crítico ao carregar etapas do Kommo:", error.response?.data || error.message);
        etapasCarregadasComSucesso = false;
    }
}

function getCustomField(customFields, fieldName) {
    if (!Array.isArray(customFields)) return "Não informado";
    const field = customFields.find(f => f.field_name === fieldName);
    return field?.values?.[0]?.value || "Não informado";
}

// Busca o nome do responsável, usando o cache ou a API do Kommo
async function getResponsibleUserName(userId) {
    if (!userId) {
        return "Responsável não identificado";
    }
    const stringUserId = String(userId);

    // 1. Verifica o mapa/cache local primeiro para economizar chamadas de API
    if (RESPONSAVEIS[stringUserId]) {
        return RESPONSAVEIS[stringUserId];
    }

    // 2. Se não estiver no cache, busca na API do Kommo
    try {
        console.log(`Buscando nome do responsável para o ID: ${stringUserId} na API do Kommo...`);
        const response = await axios.get(
            `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/users/${stringUserId}`,
            {
                headers: { Authorization: `Bearer ${KOMMO_API_TOKEN}` },
            }
        );
        const userName = response.data.name;

        // 3. Adiciona o nome encontrado ao cache para uso futuro
        if (userName) {
            RESPONSAVEIS[stringUserId] = userName;
            console.log(`Nome encontrado e salvo em cache: ID ${stringUserId} -> ${userName}`);
            return userName;
        }
    } catch (error) {
        console.error(`Erro ao buscar nome do responsável para o ID ${stringUserId}:`, error.message);
    }

    // 4. Se a busca na API falhar, retorna o ID como fallback
    console.warn(`Não foi possível encontrar o nome para o responsável ID ${stringUserId}. Usando o ID como fallback.`);
    return `ID ${stringUserId}`;
}

app.post("/webhook-hub", async (req, res) => {
    try {
        const payload = req.body || {};
        console.log("----- Inicio da Requisição -----");
        console.log("Payload bruto recebido:", JSON.stringify(payload, null, 2));

        const statusUpdateData = payload.leads?.status?.[0];
        if (!statusUpdateData) {
            return res.status(400).send("Dados de lead (status) não encontrados no payload.");
        }
        if (statusUpdateData.old_status_id === statusUpdateData.status_id) {
            return res.status(200).send("Lead ignorado (sem mudança de etapa).");
        }
        if (!etapasCarregadasComSucesso) {
            console.error("As etapas do Kommo não foram carregadas com sucesso.");
            return res.status(200).send("Erro interno: Nomes das etapas não disponíveis.");
        }

        const pipelineId = String(statusUpdateData.pipeline_id);
        const newStatusId = String(statusUpdateData.status_id);
        const leadId = statusUpdateData.id;

        let targetWebhookUrl = null;
        let messageContext = {};

        const newStageName = etapaMap[newStatusId] || '';

        const isVendaGanhaComum = newStatusId === STATUS_ID_COMUM_VENDA_GANHA;
        const isRenovacaoVendaGanha = STATUS_RENOVACAO_VENDA_GANHA[pipelineId] === newStatusId;

        if (isVendaGanhaComum || isRenovacaoVendaGanha) {
            targetWebhookUrl = GOOGLE_CHAT_WEBHOOK_URL_CELEBRAR;
            messageContext = {
                action: isRenovacaoVendaGanha ? "renovou o contrato" : "concluiu a assinatura",
                type: 'celebration'
            };
        } else if (newStageName === ETAPA_PROPOSTA_ENVIADA) {
            targetWebhookUrl = GOOGLE_CHAT_WEBHOOK_URL_PROPOSTA;
            messageContext = {
                action: "acabou de receber uma proposta",
                type: 'notification'
            };
        } else if (newStageName === ETAPA_EM_CONTRATO) {
            targetWebhookUrl = GOOGLE_CHAT_WEBHOOK_URL_CONTRATO;
            messageContext = {
                action: "recebeu o contrato para assinatura",
                type: 'notification'
            };
        }

        // Se nenhuma etapa relevante foi encontrada, ignora o webhook
        if (!targetWebhookUrl) {
            console.log(`Lead ${leadId}: Mudança para etapa "${newStageName}" (ID: ${newStatusId}) não é relevante. Ignorando.`);
            return res.status(200).send("Lead ignorado (etapa não relevante).");
        }
        
        console.log(`Lead ${leadId}: Etapa relevante detectada ("${newStageName}").`);

        const leadResponse = await axios.get(`https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads/${leadId}?with=contacts`, { headers: { Authorization: `Bearer ${KOMMO_API_TOKEN}` } });
        const lead = leadResponse.data;
        const responsibleUserName = await getResponsibleUserName(lead.responsible_user_id);

        const leadName = lead.name || "Lead sem nome";
        let title;
        if (messageContext.type === 'celebration') {
            title = `Olá! O lead *${leadName}* ${messageContext.action}! Parabéns, *${responsibleUserName}*! 🥳`;
        } else {
            title = `Atenção, *${responsibleUserName}*! O lead *${leadName}* ${messageContext.action}.`;
        }
        
        const oldStageName = etapaMap[statusUpdateData.old_status_id] || `ID ${statusUpdateData.old_status_id}`;

        const messageText =
        `${title}

        *Nome:* ${leadName}
        *Responsável:* ${responsibleUserName}
        *Etapa anterior:* ${oldStageName}
        *Nova Etapa:* ${newStageName}
        *Valor:* R$ ${(lead.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        *Unidade:* ${getCustomField(lead.custom_fields_values || [], "Unidade*")}
        *Planos:* ${getCustomField(lead.custom_fields_values || [], "Planos*")}`;

        const chatMessage = { text: messageText };

        await axios.post(targetWebhookUrl, chatMessage);
        console.log(`Mensagem sobre o lead ${leadId} enviada com sucesso.`);

        res.status(200).send("Mensagem enviada para o Google Chat apropriado!");
        console.log("----- Fim da Requisição -----");

    } catch (error) {
        console.error("Erro detalhado ao processar webhook:", error);
        if (error.response) { console.error("Resposta do erro da API:", JSON.stringify(error.response.data, null, 2)); }
        res.status(500).send("Erro interno ao processar o webhook.");
    }
});

app.listen(PORT, async () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    await carregarEtapas();
    if (!etapasCarregadasComSucesso) {
        console.warn("Atenção: O servidor iniciou, mas o mapeamento de etapas do Kommo falhou.");
    }
});