import { Column, Entity, ManyToMany, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Rota } from "./Rota";
import { Empresa } from "./Empresa";
import { Endereco } from "./Endereco";
import { RotaAtribuida } from "./RotaAtribuida";

@Entity('passageiro')
export class Passageiro {

    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    nome!: string;

    @Column({ unique: true })
    telefoneWhatsApp!: string;

    @Column({ default: true })
    ativo!: boolean;

    @ManyToOne(() => Endereco, endereco => endereco.passageiro, { cascade: true })
    endereco!: Endereco;

    @ManyToOne(() => Empresa, empresa => empresa.passageiros, { 
        cascade: true,
        nullable: true,
        onDelete: 'SET NULL'  
    })
    empresa?: Empresa;

    @Column({ default: false })
    solicitacao?: boolean;

    @ManyToOne(() => RotaAtribuida, rotaAtribuida => rotaAtribuida.passageiros)
    corridaSolicitada?: RotaAtribuida;

    @ManyToOne(() => Rota, rota => rota.passageiros, {})
    rota?: Rota;

    @Column({ nullable: true })
    ordem_na_rota?: number;

    @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
    dataDeRegistro!: Date;
    
    @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP",
    onUpdate: "CURRENT_TIMESTAMP" })
    dataDeEdicao!: Date;
}