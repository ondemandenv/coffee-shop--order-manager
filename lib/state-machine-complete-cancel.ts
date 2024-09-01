import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import {Construct} from "constructs";
import {Stack} from "aws-cdk-lib";
import {IEventBus} from "aws-cdk-lib/aws-events";
import {ITable} from "aws-cdk-lib/aws-dynamodb";
import {DynamoAttributeValue} from "aws-cdk-lib/aws-stepfunctions-tasks";

export class StateMachineCompleteCancel extends Construct {

    readonly cancelOrder = new sfn.Pass(this, 'Cancel Order', {
        result: sfn.Result.fromObject({state: 'Cancelled'}),
        resultPath: '$.result',
    });

    readonly completeOrder = new sfn.Pass(this, 'Complete Order', {
        result: sfn.Result.fromObject({state: 'Completed'}),
        resultPath: '$.result',
    });

    constructor(s: Stack, id: string, eventBus: IEventBus, orderTable: ITable) {
        super(s, id);


        const updateOrderRecord = new tasks.DynamoUpdateItem(this, 'DynamoDB Update Order Record', {
            table: orderTable,
            key: {PK: DynamoAttributeValue.fromString('orderID')},
            updateExpression: 'set #OS = :OS',
            expressionAttributeNames: {'#OS': 'ORDERSTATE'},
            expressionAttributeValues: {':OS': tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.result.state'))},
            resultPath: '$.result',
            resultSelector: {'Attributes.$': '$.Attributes'},
        });

        const constructRecord1 = new sfn.Pass(this, 'Construct record (1)', {
            parameters: {
                'orderId.$': '$.orderId',
                'userId.$': '$.result.Attributes.USERID.S',
                'ORDERSTATE.$': '$.result.Attributes.ORDERSTATE.S',
                'Message': 'Barrista has cancelled or completed teh order',
            },
            resultPath: '$.detail',
        });

        const emitCompletedOrCancelled = new tasks.EventBridgePutEvents(this, 'Emit Completed || Cancelled', {
            entries: [{
                detail: sfn.TaskInput.fromJsonPathAt('States.JsonToString($.detail)'),
                detailType: sfn.JsonPath.format('OrderManager.Order{}', sfn.JsonPath.stringAt('$.detail.ORDERSTATE')),
                eventBus,
                source: 'awsserverlessda.serverlesspresso'
            }],
            resultPath: '$.eventEmit',
        });

        const resumeOrderProcessor1 = new tasks.CallAwsService(this, 'Resume Order Processor 1', {
            service: 'sfn',
            action: 'sendTaskSuccess',
            parameters: {
                Output: '{}',
                // taskToken: sfn.JsonPath.stringAt('$.result.Attributes.TaskToken.S'),
                TaskToken: sfn.JsonPath.stringAt('$.result.Attributes.TaskToken.S'),
            },
            iamResources: ['*'],
        });

        // Chain the rest of the states
        this.cancelOrder.next(updateOrderRecord);
        this.completeOrder.next(updateOrderRecord);
        updateOrderRecord.next(constructRecord1);
        constructRecord1.next(emitCompletedOrCancelled);
        emitCompletedOrCancelled.next(resumeOrderProcessor1);
    }
}