import { MigrationInterface, QueryRunner } from "typeorm";

export class Atualização101778376456819 implements MigrationInterface {
    name = 'Atualização101778376456819'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`administrador\` CHANGE \`telefoneWhatsApp\` \`telefoneWhatsApp\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`administrador\` CHANGE \`dataDeRegistro\` \`dataDeRegistro\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE \`administrador\` CHANGE \`dataDeEdicao\` \`dataDeEdicao\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE \`usuario\` CHANGE \`dataDeRegistro\` \`dataDeRegistro\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE \`usuario\` CHANGE \`dataDeEdicao\` \`dataDeEdicao\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE \`motorista\` CHANGE \`dataDeRegistro\` \`dataDeRegistro\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE \`motorista\` CHANGE \`dataDeEdicao\` \`dataDeEdicao\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE \`lista_rota\` CHANGE \`dataReferencia\` \`dataReferencia\` timestamp NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`empresa\` DROP FOREIGN KEY \`FK_552ad335bee45ea1650c85c4f0f\``);
        await queryRunner.query(`ALTER TABLE \`empresa\` CHANGE \`logo\` \`logo\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`empresa\` CHANGE \`rotaId\` \`rotaId\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`rota\` DROP FOREIGN KEY \`FK_36b21dafdfbe458db0b545b3074\``);
        await queryRunner.query(`ALTER TABLE \`rota\` CHANGE \`listaRotaId\` \`listaRotaId\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`ordem_joinha\` DROP FOREIGN KEY \`FK_72929c3d4fb0023036109b3cef0\``);
        await queryRunner.query(`ALTER TABLE \`ordem_joinha\` CHANGE \`motoristaId\` \`motoristaId\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` DROP FOREIGN KEY \`FK_825f9e5534f420ae68d98e5d169\``);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` DROP FOREIGN KEY \`FK_53c2c6fb8670e0bcbd0dcb7c1f7\``);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` DROP FOREIGN KEY \`FK_382edab62a0ad165bcbeec96c68\``);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` DROP FOREIGN KEY \`FK_6427001841eb49957c4c7d8641b\``);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` CHANGE \`dataGeracao\` \`dataGeracao\` timestamp NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` CHANGE \`motoristaId\` \`motoristaId\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` CHANGE \`listaJoiaId\` \`listaJoiaId\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` CHANGE \`listaRotaId\` \`listaRotaId\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` CHANGE \`rotaId\` \`rotaId\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` DROP FOREIGN KEY \`FK_6dc97e4e48d0f506b72fb97e62d\``);
        await queryRunner.query(`ALTER TABLE \`passageiro\` DROP FOREIGN KEY \`FK_6a84fb56f84b1d052d0d76349a5\``);
        await queryRunner.query(`ALTER TABLE \`passageiro\` DROP FOREIGN KEY \`FK_4cffc939b0bc722387247c7ce6d\``);
        await queryRunner.query(`ALTER TABLE \`passageiro\` DROP FOREIGN KEY \`FK_d34a24bb95719584d3d3597b1fb\``);
        await queryRunner.query(`ALTER TABLE \`passageiro\` CHANGE \`ordem_na_rota\` \`ordem_na_rota\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` CHANGE \`dataDeRegistro\` \`dataDeRegistro\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` CHANGE \`dataDeEdicao\` \`dataDeEdicao\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` CHANGE \`enderecoId\` \`enderecoId\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` CHANGE \`empresaId\` \`empresaId\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` CHANGE \`corridaSolicitadaId\` \`corridaSolicitadaId\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` CHANGE \`rotaId\` \`rotaId\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`banimento\` DROP FOREIGN KEY \`FK_a23f04bfdd4c3fd9debf55ef155\``);
        await queryRunner.query(`ALTER TABLE \`banimento\` CHANGE \`motivo\` \`motivo\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`banimento\` CHANGE \`dataRegistro\` \`dataRegistro\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE \`banimento\` CHANGE \`motoristaId\` \`motoristaId\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`empresa\` ADD CONSTRAINT \`FK_552ad335bee45ea1650c85c4f0f\` FOREIGN KEY (\`rotaId\`) REFERENCES \`rota\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`rota\` ADD CONSTRAINT \`FK_36b21dafdfbe458db0b545b3074\` FOREIGN KEY (\`listaRotaId\`) REFERENCES \`lista_rota\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`ordem_joinha\` ADD CONSTRAINT \`FK_72929c3d4fb0023036109b3cef0\` FOREIGN KEY (\`motoristaId\`) REFERENCES \`motorista\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` ADD CONSTRAINT \`FK_825f9e5534f420ae68d98e5d169\` FOREIGN KEY (\`motoristaId\`) REFERENCES \`motorista\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` ADD CONSTRAINT \`FK_53c2c6fb8670e0bcbd0dcb7c1f7\` FOREIGN KEY (\`listaJoiaId\`) REFERENCES \`lista_joia\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` ADD CONSTRAINT \`FK_382edab62a0ad165bcbeec96c68\` FOREIGN KEY (\`listaRotaId\`) REFERENCES \`lista_rota\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` ADD CONSTRAINT \`FK_6427001841eb49957c4c7d8641b\` FOREIGN KEY (\`rotaId\`) REFERENCES \`rota\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` ADD CONSTRAINT \`FK_6dc97e4e48d0f506b72fb97e62d\` FOREIGN KEY (\`enderecoId\`) REFERENCES \`endereco\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` ADD CONSTRAINT \`FK_6a84fb56f84b1d052d0d76349a5\` FOREIGN KEY (\`empresaId\`) REFERENCES \`empresa\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` ADD CONSTRAINT \`FK_4cffc939b0bc722387247c7ce6d\` FOREIGN KEY (\`corridaSolicitadaId\`) REFERENCES \`atribuicao_final\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` ADD CONSTRAINT \`FK_d34a24bb95719584d3d3597b1fb\` FOREIGN KEY (\`rotaId\`) REFERENCES \`rota\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`banimento\` ADD CONSTRAINT \`FK_a23f04bfdd4c3fd9debf55ef155\` FOREIGN KEY (\`motoristaId\`) REFERENCES \`motorista\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`banimento\` DROP FOREIGN KEY \`FK_a23f04bfdd4c3fd9debf55ef155\``);
        await queryRunner.query(`ALTER TABLE \`passageiro\` DROP FOREIGN KEY \`FK_d34a24bb95719584d3d3597b1fb\``);
        await queryRunner.query(`ALTER TABLE \`passageiro\` DROP FOREIGN KEY \`FK_4cffc939b0bc722387247c7ce6d\``);
        await queryRunner.query(`ALTER TABLE \`passageiro\` DROP FOREIGN KEY \`FK_6a84fb56f84b1d052d0d76349a5\``);
        await queryRunner.query(`ALTER TABLE \`passageiro\` DROP FOREIGN KEY \`FK_6dc97e4e48d0f506b72fb97e62d\``);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` DROP FOREIGN KEY \`FK_6427001841eb49957c4c7d8641b\``);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` DROP FOREIGN KEY \`FK_382edab62a0ad165bcbeec96c68\``);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` DROP FOREIGN KEY \`FK_53c2c6fb8670e0bcbd0dcb7c1f7\``);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` DROP FOREIGN KEY \`FK_825f9e5534f420ae68d98e5d169\``);
        await queryRunner.query(`ALTER TABLE \`ordem_joinha\` DROP FOREIGN KEY \`FK_72929c3d4fb0023036109b3cef0\``);
        await queryRunner.query(`ALTER TABLE \`rota\` DROP FOREIGN KEY \`FK_36b21dafdfbe458db0b545b3074\``);
        await queryRunner.query(`ALTER TABLE \`empresa\` DROP FOREIGN KEY \`FK_552ad335bee45ea1650c85c4f0f\``);
        await queryRunner.query(`ALTER TABLE \`banimento\` CHANGE \`motoristaId\` \`motoristaId\` int NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`banimento\` CHANGE \`dataRegistro\` \`dataRegistro\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP()`);
        await queryRunner.query(`ALTER TABLE \`banimento\` CHANGE \`motivo\` \`motivo\` varchar(255) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`banimento\` ADD CONSTRAINT \`FK_a23f04bfdd4c3fd9debf55ef155\` FOREIGN KEY (\`motoristaId\`) REFERENCES \`motorista\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` CHANGE \`rotaId\` \`rotaId\` int NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` CHANGE \`corridaSolicitadaId\` \`corridaSolicitadaId\` int NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` CHANGE \`empresaId\` \`empresaId\` int NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` CHANGE \`enderecoId\` \`enderecoId\` int NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` CHANGE \`dataDeEdicao\` \`dataDeEdicao\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP() ON UPDATE CURRENT_TIMESTAMP()`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` CHANGE \`dataDeRegistro\` \`dataDeRegistro\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP()`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` CHANGE \`ordem_na_rota\` \`ordem_na_rota\` int NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` ADD CONSTRAINT \`FK_d34a24bb95719584d3d3597b1fb\` FOREIGN KEY (\`rotaId\`) REFERENCES \`rota\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` ADD CONSTRAINT \`FK_4cffc939b0bc722387247c7ce6d\` FOREIGN KEY (\`corridaSolicitadaId\`) REFERENCES \`atribuicao_final\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` ADD CONSTRAINT \`FK_6a84fb56f84b1d052d0d76349a5\` FOREIGN KEY (\`empresaId\`) REFERENCES \`empresa\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`passageiro\` ADD CONSTRAINT \`FK_6dc97e4e48d0f506b72fb97e62d\` FOREIGN KEY (\`enderecoId\`) REFERENCES \`endereco\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` CHANGE \`rotaId\` \`rotaId\` int NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` CHANGE \`listaRotaId\` \`listaRotaId\` int NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` CHANGE \`listaJoiaId\` \`listaJoiaId\` int NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` CHANGE \`motoristaId\` \`motoristaId\` int NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` CHANGE \`dataGeracao\` \`dataGeracao\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP() ON UPDATE CURRENT_TIMESTAMP()`);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` ADD CONSTRAINT \`FK_6427001841eb49957c4c7d8641b\` FOREIGN KEY (\`rotaId\`) REFERENCES \`rota\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` ADD CONSTRAINT \`FK_382edab62a0ad165bcbeec96c68\` FOREIGN KEY (\`listaRotaId\`) REFERENCES \`lista_rota\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` ADD CONSTRAINT \`FK_53c2c6fb8670e0bcbd0dcb7c1f7\` FOREIGN KEY (\`listaJoiaId\`) REFERENCES \`lista_joia\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`atribuicao_final\` ADD CONSTRAINT \`FK_825f9e5534f420ae68d98e5d169\` FOREIGN KEY (\`motoristaId\`) REFERENCES \`motorista\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`ordem_joinha\` CHANGE \`motoristaId\` \`motoristaId\` int NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`ordem_joinha\` ADD CONSTRAINT \`FK_72929c3d4fb0023036109b3cef0\` FOREIGN KEY (\`motoristaId\`) REFERENCES \`motorista\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`rota\` CHANGE \`listaRotaId\` \`listaRotaId\` int NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`rota\` ADD CONSTRAINT \`FK_36b21dafdfbe458db0b545b3074\` FOREIGN KEY (\`listaRotaId\`) REFERENCES \`lista_rota\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`empresa\` CHANGE \`rotaId\` \`rotaId\` int NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`empresa\` CHANGE \`logo\` \`logo\` varchar(255) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`empresa\` ADD CONSTRAINT \`FK_552ad335bee45ea1650c85c4f0f\` FOREIGN KEY (\`rotaId\`) REFERENCES \`rota\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`lista_rota\` CHANGE \`dataReferencia\` \`dataReferencia\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP() ON UPDATE CURRENT_TIMESTAMP()`);
        await queryRunner.query(`ALTER TABLE \`motorista\` CHANGE \`dataDeEdicao\` \`dataDeEdicao\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP() ON UPDATE CURRENT_TIMESTAMP()`);
        await queryRunner.query(`ALTER TABLE \`motorista\` CHANGE \`dataDeRegistro\` \`dataDeRegistro\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP()`);
        await queryRunner.query(`ALTER TABLE \`usuario\` CHANGE \`dataDeEdicao\` \`dataDeEdicao\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP() ON UPDATE CURRENT_TIMESTAMP()`);
        await queryRunner.query(`ALTER TABLE \`usuario\` CHANGE \`dataDeRegistro\` \`dataDeRegistro\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP()`);
        await queryRunner.query(`ALTER TABLE \`administrador\` CHANGE \`dataDeEdicao\` \`dataDeEdicao\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP() ON UPDATE CURRENT_TIMESTAMP()`);
        await queryRunner.query(`ALTER TABLE \`administrador\` CHANGE \`dataDeRegistro\` \`dataDeRegistro\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP()`);
        await queryRunner.query(`ALTER TABLE \`administrador\` CHANGE \`telefoneWhatsApp\` \`telefoneWhatsApp\` varchar(255) NULL DEFAULT 'NULL'`);
    }

}
