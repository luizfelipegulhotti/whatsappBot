import { AppDataSource } from "../data-source";
import { Rota } from "../models/Rota";
import { Passageiro } from "../models/Passageiro";
import { Empresa } from "../models/Empresa";
import { ListaRota } from "../models/ListaRota";
import NaoEncontradoErro from "../error/NaoEncontrado.404";
import validarCamposObrigatorios from "../utils/helpers/VerificarCamposObrigatorios";

class RotaService {
    private static rotaRepositorio = AppDataSource.getRepository(Rota);
    private static passageiroRepositorio = AppDataSource.getRepository(Passageiro);
    private static empresaRepositorio = AppDataSource.getRepository(Empresa);
    private static listaRotaRepositorio = AppDataSource.getRepository(ListaRota);

    // Service para listar todas as rotas:
    static async listarRotas(): Promise<Rota[]> {
        const listaDeRotasBrutas = await this.rotaRepositorio.find({
            relations: ["passageiros", "passageiros.endereco", "passageiros.endereco.bairro", "empresas", "listaRota"],
            order: { 
                passageiros: { ordem_na_rota: "ASC" }
            }
        });

        // ORDENAÇÃO NUMÉRICA SEGURA: Extrai estritamente os dígitos de dentro da string "ROTA X"
        return listaDeRotasBrutas.sort((rotaAvaliada, proximaRota) => {
            const numeroRotaAvaliada = Number(rotaAvaliada.ordem.replace(/\D/g, '')) || 0;
            const numeroProximaRota = Number(proximaRota.ordem.replace(/\D/g, '')) || 0;

            return numeroRotaAvaliada - numeroProximaRota;
        });
    }

    // Service para listar rotas por TURNO (Tarde ou Madrugada):
    static async listarPorTurno(tipo: 'ROTA_TARDE' | 'ROTA_MADRUGADA'): Promise<Rota[]> {
        const listaDeRotasPorTurno = await this.rotaRepositorio.find({
            where: { tipo_rota: tipo },
            relations: ["passageiros", "passageiros.endereco", "passageiros.endereco.bairro", "empresas"],
            order: { 
                passageiros: { ordem_na_rota: "ASC" }
            }
        });

        // ORDENAÇÃO NUMÉRICA SEGURA: Limpa o texto mantendo o peso matemático correto para o índice 10
        return listaDeRotasPorTurno.sort((rotaAvaliada, proximaRota) => {
            const numeroRotaAvaliada = Number(rotaAvaliada.ordem.replace(/\D/g, '')) || 0;
            const numeroProximaRota = Number(proximaRota.ordem.replace(/\D/g, '')) || 0;

            return numeroRotaAvaliada - numeroProximaRota;
        });
    }

    // Service para mostrar uma rota específica (por ID):
    static async mostrarUmaRota(id: number): Promise<Rota> {
        const rota = await this.rotaRepositorio.findOne({
            where: { id },
            relations: ["passageiros", "passageiros.endereco", "passageiros.endereco.bairro", "empresas", "listaRota"],
            order: { passageiros: { ordem_na_rota: "ASC" } }
        });
        if (!rota) throw new NaoEncontradoErro("Rota não encontrada no sistema!");
        return rota;
    }

    // Service para cadastrar rota (com agrupamento automático em ListaRota):
    static async cadastrarRota(dados: any): Promise<Rota> {
        validarCamposObrigatorios<Rota>(dados, ['nome', 'ordem', 'tipo_rota', 'horario']);
        
        // 1. Busca uma lista existente para o turno e data atual ou cria uma nova
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        let lista = await this.listaRotaRepositorio.findOne({
            where: { 
                tipo_lista: dados.tipo_rota,
                nomeLista: `Escala ${dados.tipo_rota === 'ROTA_TARDE' ? 'Tarde' : 'Madrugada'}` 
            }
        });

        if (!lista) {
            lista = this.listaRotaRepositorio.create({
                nomeLista: `Escala ${dados.tipo_rota === 'ROTA_TARDE' ? 'Tarde' : 'Madrugada'}`,
                tipo_lista: dados.tipo_rota,
                dataReferencia: new Date()
            });
            await this.listaRotaRepositorio.save(lista);
        }

        // 2. Carrega a empresa para o relacionamento ManyToMany
        const empresaCarregada = await this.empresaRepositorio.findOneBy({ id: Number(dados.empresaId) });

        // 3. Cria a rota vinculada à lista e à empresa
        const novaRota = this.rotaRepositorio.create({
            nome: dados.nome,
            ordem: dados.ordem,
            tipo_rota: dados.tipo_rota,
            horario: dados.horario,
            empresas: empresaCarregada ? [empresaCarregada] : [],
            listaRota: lista
        });

        const rotaSalva = await this.rotaRepositorio.save(novaRota);

        // 4. Vincula passageiros salvando a ordem exata
        if (dados.passageirosIds && dados.passageirosIds.length > 0) {
            await this.vincularPassageirosARota(rotaSalva, dados.passageirosIds);
        }

        return rotaSalva;
    }

    // Service para editar rota:
    static async editarRota(id: number, dados: any): Promise<Rota> {
        const rotaExistente = await this.rotaRepositorio.findOne({ 
            where: { id }, 
            relations: ["passageiros", "empresas"] 
        });

        if (!rotaExistente) throw new NaoEncontradoErro("Rota não encontrada para edição!");

        // 1. Atualiza Passageiros e Ordem
        if (dados.passageirosIds) {
            await this.passageiroRepositorio.update(
                { rota: { id } }, 
                { rota: null as any, ordem_na_rota: null as any }
            );
            await this.vincularPassageirosARota(rotaExistente, dados.passageirosIds);
        }

        // 2. Atualiza a Empresa (ManyToMany)
        if (dados.empresaId) {
            const novaEmpresa = await this.empresaRepositorio.findOneBy({ id: Number(dados.empresaId) });
            rotaExistente.empresas = novaEmpresa ? [novaEmpresa] : [];
        }

        // 3. Remove passageiros da memória para o merge não sobrescrever o banco
        delete (rotaExistente as any).passageiros;

        const { passageirosIds, empresaId, ...dadosRestantes } = dados;
        this.rotaRepositorio.merge(rotaExistente, dadosRestantes);
        
        return await this.rotaRepositorio.save(rotaExistente);
    }

    // Service para excluir rota:
    static async deletarRota(id: number): Promise<void> {
        const rota = await this.rotaRepositorio.findOneBy({ id });
        if (!rota) throw new NaoEncontradoErro("Rota não encontrada!");

        // Libera passageiros desta rota
        await this.passageiroRepositorio.update(
            { rota: { id } }, 
            { rota: null as any, ordem_na_rota: null as any }
        );
        
        await this.rotaRepositorio.remove(rota);
    }

    // Helper para vincular passageiros um a um garantindo a ordem numérica:
    private static async vincularPassageirosARota(rota: Rota, passageirosIds: number[]) {
        if (passageirosIds.length > 0) {
            for (let i = 0; i < passageirosIds.length; i++) {
                await this.passageiroRepositorio.update(passageirosIds[i], { 
                    rota: { id: rota.id } as any,
                    ordem_na_rota: i + 1 
                });
            }
        }
    }
}

export default RotaService;