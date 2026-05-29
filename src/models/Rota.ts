import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, ManyToMany, JoinTable } from "typeorm";
import { ListaRota } from "./ListaRota";
import { Passageiro } from "./Passageiro";
import { Empresa } from "./Empresa";

@Entity('rota')
export class Rota {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    nome!: string;

    @Column()
    ordem!: string;

    @OneToMany(() => Passageiro, passageiro => passageiro.rota)
    passageiros!: Passageiro[];

    @Column()
    tipo_rota!: 'ROTA_TARDE' | 'ROTA_MADRUGADA';

    @ManyToMany(() => Empresa, empresa => empresa.rotas)
    @JoinTable() 
    empresas!: Empresa[];

    @Column()
    horario!: string;

    @ManyToOne(() => ListaRota, listaRota => listaRota.rotaLista)
    listaRota?: ListaRota;
}