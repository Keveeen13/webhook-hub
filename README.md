# Webhook de Notificações da Kommo para Google Chat

![Node.js](https://img.shields.io/badge/Node.js-18.x-blue?logo=nodedotjs) ![Express.js](https://img.shields.io/badge/Express.js-4.x-green?logo=express) ![License](https://img.shields.io/badge/License-MIT-yellow)

## 📖 Descrição

Este projeto é um servidor intermediário (webhook) construído em Node.js que integra o CRM da **Kommo** com o **Google Chat**. Sua principal função é executar as mudanças de etapa de leads no Kommo e enviar notificações personalizadas para diferentes espaços (canais) no Google Chat, dependendo da etapa para a qual o lead foi movido.

Isso permite que as equipes de vendas acompanhem o progresso do funil de vendas em tempo real, diretamente do Google Chat.

## ✨ Features

-   **Notificações em Tempo Real:** Envia uma mensagem instantânea para o Google Chat assim que um lead muda de etapa no Kommo.
-   **Roteamento Inteligente:** Direciona notificações para quatro canais distintos com base na etapa do lead:
    -   Proposta Enviada
    -   Em Contrato
    -   Venda ganha
    -   Renovação Venda Ganha
-   **Mensagens Contextuais:** O conteúdo da mensagem é dinâmico e se adapta ao contexto (uma mensagem para Venda Ganha), um alerta para uma venda que foi concluida.
-   **Busca de Dados Adicionais:** Enriquece as notificações buscando o nome completo do responsável pelo lead diretamente na API da Kommo.
-   **Cache de Nomes:** Armazena em memória os nomes dos responsáveis já buscados para minimizar chamadas à API e aumentar a eficiência.
-   **Configuração via Variáveis de Ambiente:** Totalmente configurável através de um arquivo `.env`, mantendo as credenciais e URLs seguras e fora do código.

## ⚙️ Fluxo da Aplicação

1.  Um usuário no **Kommo** altera a etapa de um lead.
2.  O Kommo dispara um evento de webhook para a URL deste servidor.
3.  O servidor **Node.js/Express** recebe a requisição (`POST /webhook-hub`).
4.  O servidor identifica a **nova etapa** do lead.
5.  A **lógica de roteamento** verifica se a etapa é relevante e seleciona a URL do webhook do Google Chat correspondente.
6.  Se a etapa for relevante, o servidor faz chamadas adicionais à **API da Kommo** para obter detalhes do lead e o nome do responsável.
7.  Uma **mensagem personalizada** é formatada com todos os dados coletados.
8.  A mensagem final é enviada para o espaço correto no **Google Chat**.

## 🛠️ Tecnologias Utilizadas

-   **Backend:** [Node.js](https://nodejs.org/)
-   **Framework:** [Express.js](https://expressjs.com/)
-   **Cliente HTTP:** [Axios](https://axios-http.com/)
-   **Variáveis de Ambiente:** [Dotenv](https://github.com/motdotla/dotenv)

## 🚀 Instalação e Configuração

Siga os passos abaixo para rodar o projeto localmente.

### Pré-requisitos

-   [Node.js](https://nodejs.org/) (versão 16.x ou superior)
-   [npm](https://www.npmjs.com/) ou [yarn](https://yarnpkg.com/)
-   Uma conta na [Kommo](https://www.kommo.com/) com permissões de administrador.
-   Pelo menos 3 espaços no Google Chat, cada um com um webhook configurado.
-   [Postman](https://www.postman.com/) (recomendado para os testes).

### Passos

1.  **Clone o repositório:**
    ```bash
    cd seu-repositorio
    git clone https://github.com/seu-usuario/seu-repositorio.git
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Crie e configure o arquivo de variáveis de ambiente:**
    * Crie um arquivo chamado `.env` na raiz do projeto.
    * Copie o conteúdo do exemplo abaixo e preencha com suas próprias credenciais.

    **.env.example**
    ```ini
    # Credenciais da API do Kommo
    KOMMO_API_TOKEN=SEU_TOKEN_DE_INTEGRAÇÃO_AQUI
    KOMMO_SUBDOMAIN=SEU_SUBDOMINIO_KOMMO_AQUI

    # URLs dos Webhooks do Google Chat
    GOOGLE_CHAT_WEBHOOK_URL_CELEBRAR=URL_DO_WEBHOOK_DO_ESPAÇO_CELEBRAR
    GOOGLE_CHAT_WEBHOOK_URL_PROPOSTA=URL_DO_WEBHOOK_DO_ESPAÇO_PROPOSTA
    GOOGLE_CHAT_WEBHOOK_URL_CONTRATO=URL_DO_WEBHOOK_DO_ESPAÇO_CONTRATO

    # Porta do servidor (opcional, padrão 3000)
    PORT=3000
    ```

## ▶️ Uso

1.  **Inicie o servidor:**
    ```bash
    node seu_arquivo.js
    ```
    O terminal deverá exibir uma mensagem de que o servidor está rodando.

2.  **Exponha seu servidor local (para testes):**
    Para que o Kommo possa enviar webhooks para sua máquina local, você precisa de uma URL pública. Use uma ferramenta como o [ngrok](https://ngrok.com/) ou um domínio próprio.
    ```bash
    ngrok http 3000
    ```
    O ngrok fornecerá uma URL pública (ex: `https://abcd-1234.ngrok.io`).

3.  **Configure o Webhook no Kommo:**
    * Vá em `Configurações` > `Integrações` no seu Kommo.
    * Clique em `Criar Integração` > `Permitir acesso a todos` > `Nome da integração` > `Salvar`.
    * Cole a URL gerada pelo ngrok (ou a URL do seu servidor de produção) seguida da rota `/webhook-hub`. Ex: `https://abcd-1234.ngrok.io/webhook-hub`.
    * Selecione os eventos que devem acionar o webhook, principalmente **"Etapa do lead alterada"**.
    * Salve a integração.

## 🔌 Endpoint da API

### `POST /webhook-hub`

Este é o único endpoint da API, responsável por receber todas as notificações de webhook enviadas pela Kommo.

-   **Método:** `POST`
-   **Headers:** `Content-Type: application/json`
-   **Corpo da Requisição (Exemplo):**
    O corpo da requisição deve seguir a estrutura enviada pelo Kommo no evento "Etapa do lead alterada".

    ```json
    {
        "leads": {
            "status": [
                {
                    "id": 123456,
                    "status_id": "56091780",
                    "pipeline_id": "5393324",
                    "old_status_id": "12345678"
                }
            ]
        }
    }
    ```

-   **Respostas:**
    -   `200 OK`: A requisição foi processada com sucesso. O corpo da resposta pode variar:
        -   `"Mensagem enviada para o Google Chat apropriado!"`: A notificação foi enviada.
        -   `"Lead ignorado (etapa não relevante)."`: A mudança de etapa não correspondia a nenhuma das regras de roteamento.
        -   `"Lead ignorado (sem mudança de etapa)."`: O webhook foi acionado mas o ID da etapa antiga e nova são os mesmos.
    -   `400 Bad Request`: `"Dados de lead (status) não encontrados no payload."` - O corpo da requisição não continha os dados esperados.
    -   `500 Internal Server Error`: `"Erro interno ao processar o webhook."` - Ocorreu um erro no servidor (ex: falha ao contatar a API do Kommo, erro de lógica). Verifique os logs do servidor para detalhes.

## 🧪 Testes

É altamente recomendado testar o endpoint com o [Postman](https://www.postman.com/) antes de configurar no Kommo.

1.  Inicie o servidor localmente.
2.  Configure uma requisição `POST` no Postman para `http://localhost:3000/webhook-hub`.
3.  Adicione o header `Content-Type: application/json`.
4.  No `Body`, selecione `raw` e `JSON` e cole um dos [payloads de teste](#-endpoint-da-api).
5.  Envie a requisição e observe os logs no seu terminal e a mensagem no Google Chat.

## 📋 Variáveis de Ambiente

| Variável                             | Descrição                                                                                               | Exemplo                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `KOMMO_API_TOKEN`                    | Token de integração de longo prazo gerado no Kommo.                                                     | `eyJ0eXAiOiJKV1Qi...`          |
| `KOMMO_SUBDOMAIN`                    | O subdomínio da sua conta Kommo.                                                                        | `suaempresa`                   |
| `GOOGLE_CHAT_WEBHOOK_URL_CELEBRAR`   | A URL do webhook do espaço no Google Chat para celebrar vendas.                                           | `https://chat.googleapis.com/...` |
| `GOOGLE_CHAT_WEBHOOK_URL_PROPOSTA`   | A URL do webhook do espaço no Google Chat para notificar sobre propostas enviadas.                        | `https://chat.googleapis.com/...` |
| `GOOGLE_CHAT_WEBHOOK_URL_CONTRATO`   | A URL do webhook do espaço no Google Chat para notificar sobre contratos em assinatura.                   | `https://chat.googleapis.com/...` |
| `PORT`                               | (Opcional) A porta em que o servidor Express irá rodar.                                                 | `3000`                         |


## 🧑🏻‍💻 Minha visão e contribuições

Este projeto foi desenvolvido por mim, com o auxílio de IAs (Gemini 2.5 Pro e ChatGPT-4o/4o-mini) para a resolução de dúvidas e organização do código. Para feedbacks ou sugestões, minhas redes de contato estão disponíveis no meu perfil do Github.

Contribuições são bem-vindas! Se você tiver sugestões para melhorar este projeto, sinta-se à vontade:

1.  Fazer um Fork do projeto.
2.  Criar uma nova Branch (`git checkout -b feature/sua-feature`).
3.  Fazer Commit de suas mudanças (`git commit -m 'Adiciona sua-feature'`).
4.  Fazer Push para a Branch (`git push origin feature/sua-feature`).
5.  Abrir um Pull Request.

## 📜 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE.md) para mais detalhes.