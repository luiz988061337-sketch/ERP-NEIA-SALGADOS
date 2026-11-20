/** Preload exclusivo do verificador visual: bloqueia conexões TCP e datagramas. */
import net from 'node:net';
import dgram from 'node:dgram';
import { syncBuiltinESMExports } from 'node:module';
const bloquear = () => { throw new Error('NEIA_VISUAL_SEM_REDE: conexao bloqueada durante verificacao local'); };
net.Socket.prototype.connect = bloquear;
dgram.Socket.prototype.send = bloquear;
globalThis.fetch = async () => { throw new Error('NEIA_VISUAL_SEM_REDE: fetch bloqueado'); };
syncBuiltinESMExports();
