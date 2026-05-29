import { AppDataSource } from "../data-source";
import { RotaAtribuida } from "../models/RotaAtribuida";
import { ListaRota } from "../models/ListaRota";
import { ListaJoia } from "../models/ListaJoia";
import NaoEncontradoErro from "../error/NaoEncontrado.404";
import { MoreThanOrEqual } from "typeorm";

class AtribuicaoService {
    private static atribuicaoRepo = AppDataSource.getRepository(RotaAtribuida);
    private static listaRotaRepo = AppDataSource.getRepository(ListaRota);
    private static listaJoiaRepo = AppDataSource.getRepository(ListaJoia);

    // Cruza o modelo fixo (ListaRota) com os motoristas do dia (ListaJoia):
    static async gerarEscalaDiaria(turno: 'ROTA_TARDE' | 'ROTA_MADRUGADA') {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const modeloLista = await this.listaRotaRepo.findOne({ 
            where: { tipo_lista: turno }, 
            relations: ["rotaLista", "rotaLista.passageiros", "rotaLista.passageiros.endereco", "rotaLista.empresas"] 
        });

        if (!modeloLista) throw new NaoEncontradoErro(`Modelo de rotas para ${turno} não encontrado!`);

        const listaJoiaDoDia = await this.listaJoiaRepo.findOne({ 
            where: { dia: MoreThanOrEqual(hoje) }, 
            relations: ["ordem_joinha", "ordem_joinha.motorista"] 
        });

        if (!listaJoiaDoDia) throw new NaoEncontradoErro("Nenhum motorista disponível (joinha) para hoje!");

        // Ordenação rigorosa por 'ordem' (Rota) e 'posicao' (Motorista)
        const rotasDoGabarito = modeloLista.rotaLista.sort((a, b) => a.ordem.localeCompare(b.ordem, undefined, {numeric: true}));
        const motoristasFila = listaJoiaDoDia.ordem_joinha.sort((a, b) => a.posicao - b.posicao);

        const novasAtribuicoes: RotaAtribuida[] = [];

        for (let i = 0; i < rotasDoGabarito.length; i++) {
            const rotaModelo = rotasDoGabarito[i];
            const motoristaDaVez = motoristasFila[i];

            if (motoristaDaVez) {
                const novaAtribuicao = this.atribuicaoRepo.create({
                    dataGeracao: new Date(),
                    motorista: motoristaDaVez.motorista,
                    rota: rotaModelo,
                    listaRota: modeloLista,
                    listaJoia: listaJoiaDoDia,
                    tipoAtribuicao: "ROTA",
                    passageiros: rotaModelo.passageiros 
                });
                novasAtribuicoes.push(await this.atribuicaoRepo.save(novaAtribuicao));
            }
        }
        return novasAtribuicoes;
    }

    // Retorna as atribuições prontas para o Bot ou App:
    static async listarAtribuicoesDoDia(turno: 'ROTA_TARDE' | 'ROTA_MADRUGADA') {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        return await this.atribuicaoRepo.find({
            where: { 
                dataGeracao: MoreThanOrEqual(hoje),
                listaRota: { tipo_lista: turno }
            },
            relations: ["motorista", "rota", "rota.empresas", "passageiros", "passageiros.endereco", "passageiros.endereco.bairro"],
            order: { rota: { ordem: "ASC" } }
        });
    }

    // Deleta uma atribuição:
    static async deletarAtribuicao(id: number): Promise<void> {
        const atribuicao = await this.atribuicaoRepo.findOneBy({ id });
        if (!atribuicao) throw new NaoEncontradoErro("Atribuição não encontrada!");
        await this.atribuicaoRepo.remove(atribuicao);
    }
}

export default AtribuicaoService;