import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import {ContractsEnverCdk} from "@ondemandenv/odmd-contracts/lib/odmd-model/contracts-enver-cdk";
import {EventBus, IEventBus, Rule} from "aws-cdk-lib/aws-events";
import {OndemandContracts} from "@ondemandenv/odmd-contracts";
import {
    CoffeeShopOrderProcessorEnver
} from "@ondemandenv/odmd-contracts/lib/repos/coffee-shop/coffee-shop-order-processor-cdk";
import {AttributeType, BillingMode, ITable, Table} from "aws-cdk-lib/aws-dynamodb";
import {aws_events_targets, RemovalPolicy} from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import {StateMachineCompleteCancel} from "./state-machine-complete-cancel";
import {StateMachineClaimMake} from "./state-machine-claimOrder";
import {StateMachinePutOrder} from "./state-machine-putOrder";


export class CoffeeShopOrderManagerStack extends cdk.Stack {
    constructor(scope: Construct, enver: ContractsEnverCdk, props?: cdk.StackProps) {
        const id = enver.getRevStackNames()[0];
        super(scope, id, props);

        const myEnver = enver as CoffeeShopOrderProcessorEnver
        const eventBus: IEventBus = EventBus.fromEventBusName(this, 'eventBus', myEnver.eventBus.getSharedValue(this))
        const source = myEnver.eventSrc.getSharedValue(this) as string

        // const configTable = Table.fromTableName(this, 'configTable', myEnver.configTableName.getSharedValue(this))
        // const countingTable = Table.fromTableName(this, 'countTableName', myEnver.countTableName.getSharedValue(this))


        // e.eventBus.getSharedValue(this)

        const orderTable = new Table(this, 'orderTable', {
            partitionKey: {name: 'PK', type: AttributeType.STRING},
            sortKey: {name: 'SK', type: AttributeType.STRING},
            billingMode: BillingMode.PAY_PER_REQUEST,
            // billing: Billing.onDemand(),
            removalPolicy: RemovalPolicy.DESTROY
        });

        const onWorkflowStartedFunc = new NodejsFunction(this, 'onWorkflowStarted-func', {
            entry: __dirname + '/onWorkflowStarted/index.ts',
            environment: {
                orderTableName: orderTable.tableName
            }
        });
        new Rule(this, 'onWorkflowStarted-rule', {
            eventBus, eventPattern: {
                source: [source],
                detailType: [OndemandContracts.inst.coffeeShopOrderProcessorCdk.WORKFLOW_STARTED]
            },
            targets: [new aws_events_targets.LambdaFunction(
                onWorkflowStartedFunc
            )]
        })
        orderTable.grantFullAccess(onWorkflowStartedFunc)


        const configTable: ITable = dynamodb.Table.fromTableName(this, 'ConfigTable', myEnver.configTableName.getSharedValue(this));

        const cc = new StateMachineCompleteCancel(this, 'StateMachineCompleteCancel', eventBus, orderTable)
        const sm = new StateMachineClaimMake(this, 'StateMachineClaimMake', eventBus, orderTable)
        const po = new StateMachinePutOrder(this, 'StateMachinePutOrder', configTable, orderTable)


        // Define states
        const decideAction = new sfn.Choice(this, 'Decide Action');
        // Define state machine
        const stateMachine = new sfn.StateMachine(this, 'ServerlesspressoStateMachine', {
            definitionBody: sfn.DefinitionBody.fromChainable(
                decideAction
                    .when(sfn.Condition.stringEquals('$.action', 'complete'), cc.completeOrder)
                    .when(sfn.Condition.stringEquals('$.action', 'cancel'), cc.cancelOrder)
                    .when(sfn.Condition.stringEquals('$.action', 'make'), sm.claimOrder)
                    .when(sfn.Condition.stringEquals('$.action', 'unmake'), sm.claimOrder)
                    .otherwise(po.customerPutOrder)
            ),
            // Add other necessary properties like logging, tracing, etc.
        });


    }
}
