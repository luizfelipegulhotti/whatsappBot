import 'reflect-metadata'; 
import express from 'express'; 
import cors from 'cors'; 
import path from 'path'; 
import { AppDataSource } from "./data-source"; 

// Services e Controllers do Bot 
import { WhatsAppController } from './bot/WhatsAppController'; 
import { RegistroService } from "./service/whatsapp/RegistroService"; 
import { EscalaService } from "./service/whatsapp/EscalaService"; 

// Importação das Rotas 
import rotasMotorista from "./routes/RotasMotorista"; 
import rotasAdministrador from "./routes/RotasAdministrador"; 
import rotasPassageiro from './routes/RotasPassageiro'; 
import rotasEmpresa from './routes/RotasEmpresa'; 
import rotasEndereco from './routes/RotasEndereco'; 
import rotasBairro from './routes/RotasBairro'; 
import rotasCidade from './routes/RotasCidade'; 
import rotasEstado from './routes/RotasEstado'; 
import rotasPais from './routes/RotasPais';
import rotasRota from './routes/RotasRota';
import rotasAtribuicao from './routes/RotasAtrbuicao'; 
import MiddlewareErro from './middlewares/MiddlewareErro'; 
import rotasWhatsApp from './routes/RotasWhatsApp';

const app = express(); 
app.use(cors()); 
app.use(express.json()); 
app.use('/imagens', express.static(path.join(__dirname, 'public', 'imagem_uso'))); 
app.use('/fontes', express.static(path.join(__dirname, 'public', 'imagem_fonte'))); 

// Exportação global do controlador para os endpoints HTTP consumirem
export let botInstance: WhatsAppController; 

async function startApp() { 
    try { 
        // 1. Conecta ao Banco de Dados Relacional
        await AppDataSource.initialize(); 
        console.log("🚀 Banco Conectado!"); 

        // 2. Instancia a Camada de Serviços
        const registroService = new RegistroService(); 
        const escalaService = new EscalaService(); 

        // 3. Inicializa o Controlador baseado na arquitetura Baileys
        botInstance = new WhatsAppController(registroService, escalaService); 
        
        console.log("🤖 Iniciando WhatsApp..."); 
        // Dispara a conexão por Socket Puro e geração automática de QR Code no terminal
        await botInstance.inicializar(); 

        // 4. Mapeamento de Rotas HTTP da API
        app.get('/', (req, res) => res.json({ message: 'API Online' })); 
        app.use(rotasMotorista); 
        app.use(rotasAdministrador); 
        app.use(rotasPassageiro); 
        app.use(rotasEmpresa); 
        app.use(rotasEndereco); 
        app.use(rotasBairro); 
        app.use(rotasCidade); 
        app.use(rotasEstado); 
        app.use(rotasPais); 
        app.use(rotasRota); 
        app.use(rotasAtribuicao); 
        app.use(rotasWhatsApp); 
        app.use(MiddlewareErro); 

        // 5. Inicialização do Servidor Express na Rede Local
        const PORTA = 8080; 
        app.listen(PORTA, '0.0.0.0', () => { 
            console.log(`🌐 Servidor na porta ${PORTA}`); 
        }); 

    } catch (error) { 
        console.error("❌ Falha crítica:", error); 
    } 
} 

startApp();