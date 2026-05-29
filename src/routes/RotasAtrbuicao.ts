import { Router } from "express";
import AtribuicaoController from "../controllers/AtribuicaoController";

const rotasAtribuicao = Router();

// Endpoint para disparar o cruzamento automático baseada no turno (Tarde ou Madrugada):
rotasAtribuicao.post('/atribuicao/gerar', 
    (AtribuicaoController.gerarEscalaAutomatica)
);

// Listar a escala gerada hoje para um turno específico:
rotasAtribuicao.get('/atribuicao/dia/:turno', 
    (AtribuicaoController.listarEscalaDoDia)
);

// Remover um motorista de uma rota atribuída:
rotasAtribuicao.delete('/atribuicao/:id', 
    (AtribuicaoController.deletarAtribuicao)
);

export default rotasAtribuicao;
