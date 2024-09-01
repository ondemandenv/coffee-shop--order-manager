import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as lambda from "aws-cdk-lib/aws-lambda";
import {Construct} from "constructs";
import {Stack} from "aws-cdk-lib";
import {ITable} from "aws-cdk-lib/aws-dynamodb";

export class StateMachinePutOrder extends Construct {

    readonly customerPutOrder = new sfn.Pass(this, 'Customer Put Order');

    constructor(s: Stack, id: string, configTable: ITable, orderTable: ITable) {
        super(s, id);


        const getMenu = new tasks.DynamoGetItem(this, 'get menu', {
            table: configTable,
            key: {PK: tasks.DynamoAttributeValue.fromString('menu')},
            resultPath: '$.menu',
        });

        const sanitizeOrder = new tasks.LambdaInvoke(this, 'Sanitize order', {
            lambdaFunction: lambda.Function.fromFunctionName(
                this,
                'SanitizeOrderLambda',
                'serverless-workshop-SanitizeOrderLambda-XuThnDw7m8yp'
            ),
            payloadResponseOnly: true,
            resultPath: '$.sanitise',
        });

        const isOrderValid = new sfn.Choice(this, 'Is Order Valid?');
        const notAValidOrder = new sfn.Succeed(this, 'not a valid order');

        const updateOrder = new tasks.DynamoUpdateItem(this, 'Update order', {
            table: orderTable,
            key: {
                PK: tasks.DynamoAttributeValue.fromString('orders'),
                SK: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.orderId'))
            },
            updateExpression: 'set #drinkOrder = :drinkOrder',
            conditionExpression: '#userId = :userId AND attribute_exists(TaskToken)',
            expressionAttributeNames: {'#drinkOrder': 'drinkOrder', '#userId': 'USERID'},
            expressionAttributeValues: {
                ':drinkOrder': tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('States.JsonToString($.body)')),
                ':userId': tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.body.userId')),
            },
            resultSelector: {'TaskToken.$': '$.Attributes.TaskToken.S'},
            resultPath: '$.record',
        });

        const resumeOrderProcessor2 = new tasks.CallAwsService(this, 'Resume Order Processor 2', {
            service: 'sfn',
            action: 'sendTaskSuccess',
            parameters: {
                Output: '{}',
                TaskToken: sfn.JsonPath.stringAt('$.TaskToken'),
            },
            iamResources: ['*'],
        });


        this.customerPutOrder.next(getMenu);
        getMenu.next(sanitizeOrder).next(isOrderValid);
        isOrderValid.when(sfn.Condition.booleanEquals('$.sanitise.Payload', false), notAValidOrder)
            .otherwise(updateOrder);
        updateOrder.next(resumeOrderProcessor2);


    }
}