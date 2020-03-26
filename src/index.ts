import express from "express";
import dotenv from "dotenv";
import configurations from "./config.json";
dotenv.config();
const environment: string = process.env.NODE_ENV || "local";
const config = (configurations as {[environment: string]: any})[environment];
const app = express();
import LedgerSystem from "./ledger";
app.use(express.json());

const ledgerSystem = new LedgerSystem(config.DATABASE_CONFIG[config.DATABASE]);

const operationRoutes = express.Router();
const accountRoutes = express.Router();

// Operations
operationRoutes.post('/transfer-sync', async (req, res) => {
    const operationId = await ledgerSystem.postTransferOperation(req.body, true);
    const operation = ledgerSystem.getOperation(operationId);
    res.json({
        success: true,
        operation
    })
    return;
})

operationRoutes.post('/transfer', async (req, res) => {
    const operationId = ledgerSystem.postTransferOperation(req.body);
    res.json({
        success: true,
        id: operationId
    })
    return;
})

operationRoutes.post('/', (req, res) => {
    const operationId = ledgerSystem.postOperation(req.body);
    res.json({
        success: true,
        id: operationId
    })
    return;
})

operationRoutes.get('/', (req, res) => {
    const operation = ledgerSystem.getOperation(req.query.id);
    if (!operation) {
        res.status(404).send("Operation not found!");
        return;
    }
    res.json({
        success: true,
        operation
    })
    return;
})

// Accounts
accountRoutes.post('/', (req, res) => {
    const accountId = ledgerSystem.createAccount(req.body);
    res.json({
        success: true,
        id: accountId
    })
    return;
})

accountRoutes.get('/', (req, res) => {
    const account = ledgerSystem.getAccount(req.query.id);
    if (!account) {
        res.status(404).send("Account not found!");
        return;
    }
    res.json({
        success: true,
        account
    })
    return;
})

accountRoutes.get('/balances', (req, res) => {
    const balances: any = ledgerSystem.getAccountBalances(req.query.id);
    if (!balances) {
        res.status(404).send("Account not found!");
        return;
    }
    if (req.query.assetId) {
        const assetId = req.query.assetId;
        if (balances[assetId] === undefined) {
            res.status(404).send(`No ${assetId} balance found for this account!`)
            return;
        } else {
            const shortlistedBalances: any = {};
            shortlistedBalances[assetId] = balances[assetId];
            res.json({
                success: true,
                balances: shortlistedBalances
            })
            return;
        }
    }
    res.json({
        success: true,
        balances
    })
    return;
})

// Routes
app.use('/operation', operationRoutes);
app.use('/account', accountRoutes);

const port = config.API_PORT || 3000;
app.listen(port, () => {
    // console.log(`API server istening on port ${port}!`)
})
module.exports = app    // for testing purpose
