import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, Index } from "typeorm";
import { Motorista } from "./Motorista";
import { ListaJoia } from "./ListaJoia";
import { ListaRota } from "./ListaRota";
import { Passageiro } from "./Passageiro";
import { Rota } from "./Rota";

@Entity('atribuicao_final')
export class RotaAtribuida {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: "date", name: "dataGeracao" }) 
    dataGeracao!: Date;

    @Index()
    @ManyToOne(() => Motorista, { onDelete: 'CASCADE' })
    motorista!: Motorista;

    @Column({
        type: "enum",
        enum: ["ROTA", "APOIO", "PLANTAO"],
        default: "ROTA"
    })
    tipoAtribuicao!: "ROTA" | "APOIO" | "PLANTAO";

    @Column({ nullable: true})
    ehApoioManual?: boolean;

    @Index()
    @ManyToOne(() => ListaJoia, { onDelete: 'CASCADE' })
    listaJoia!: ListaJoia;

    @Index()
    @ManyToOne(() => ListaRota, lista => lista.rotaLista, { onDelete: 'CASCADE' })
    listaRota!: ListaRota;

    @OneToMany(() => Passageiro, passageiro => passageiro.corridaSolicitada)
    passageiros!: Passageiro[];

    @ManyToOne(() => Rota, { onDelete: 'CASCADE' })
    rota!: Rota;
}