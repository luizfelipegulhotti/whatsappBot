import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Unique, JoinColumn } from "typeorm";
import { Motorista } from "./Motorista";
import { ListaJoia } from "./ListaJoia";

@Entity('ordem_joinha')
@Unique(["motoristaId", "listaJoiaId"])
export class OrdemJoinha {
    
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    posicao!: number;

    @Column({ type: "int", nullable: true })
    posicaoEfetiva!: number | null;

    @Column({ type: "int", nullable: true })
    motoristaId!: number | null;

    @ManyToOne(() => Motorista)
    @JoinColumn({ name: "motoristaId" })
    motorista!: Motorista;

    @Column({ type: "tinyint", default: 0 })
    isPenalizado!: boolean;

    @Column({ type: "int" })
    listaJoiaId!: number;

    @ManyToOne(() => ListaJoia, (lista) => lista.ordem_joinha, { nullable: false })
    @JoinColumn({ name: "listaJoiaId" })
    listaJoia!: ListaJoia;

    @Column({ type: "boolean", default: false, nullable: true })
    isApoioManual!: boolean;

    @Column({ 
        type: "timestamp", 
        precision: 6, 
        default: () => "CURRENT_TIMESTAMP(6)"
    })
    horaDoJoinha!: Date;
}
