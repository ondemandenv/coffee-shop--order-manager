# Coffee Shop Order Manager Service

**Order Lifecycle Management Service for the ONDEMANDENV Coffee Shop Demo**

This service demonstrates **dependency consumption** and **business logic implementation** within the ONDEMANDENV platform, showing how application services consume shared infrastructure while maintaining clear boundaries and enabling independent development.

## Service Overview

The Order Manager service handles the complete **order lifecycle management** for the coffee shop application:

- **Order Creation**: Accept and validate new customer orders
- **State Management**: Track order status through fulfillment pipeline  
- **Event Publishing**: Notify other services of order state changes
- **Configuration Management**: Dynamic configuration via shared config service

## Architecture Role

```
┌─────────────────────────────────────────────────────────────┐
│                    Coffee Shop Architecture                 │
│                                                             │
│  ┌─────────────────┐    ┌──────────────────┐               │
│  │ Order Manager   │    │ Order Processor  │               │
│  │ ◄── You Are Here│    │                  │               │
│  │                 │    │ Consumes:        │               │
│  │ Consumes:       │    │ • Event Bus      │               │
│  │ • Event Bus     │    │ • Config Table   │               │
│  │ • Config Table  │    │ • Counter Table  │               │
│  │ • Counter Table │    │                  │               │
│  │                 │    │ Publishes:       │               │
│  │ Publishes:      │    │ • Fulfillment    │               │
│  │ • Order Events  │    │   Events         │               │
│  └─────────────────┘    └──────────────────┘               │
│           │                       │                        │
│           └───────────┬───────────┘                        │
│                       │                                    │
│                       ▼                                    │
│           ┌─────────────────────────┐                      │
│           │    Foundation Service   │                      │
│           │                         │                      │
│           │ Publishes:              │                      │
│           │ • Event Bus Source      │                      │
│           │ • Configuration Table   │                      │
│           │ • Counter Table         │                      │
│           └─────────────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

## Contract Definition

This service's dependency contracts are defined in [`contracts-sandbox`](../../contracts-sandbox):

```typescript
// contracts-sandbox/lib/repos/coffee-shop/coffee-shop-order-manager-cdk.ts
export class CoffeeShopOrderManagerEnver extends OdmdEnverCdk {
    // Consumes from Foundation Service
    readonly eventBus: OdmdCrossRefConsumer<CoffeeShopOrderManagerEnver, CoffeeShopFoundationEnver>;
    readonly eventSrc: OdmdCrossRefConsumer<CoffeeShopOrderManagerEnver, CoffeeShopFoundationEnver>;
    readonly configTableName: OdmdCrossRefConsumer<CoffeeShopOrderManagerEnver, CoffeeShopFoundationEnver>;
    readonly countTableName: OdmdCrossRefConsumer<CoffeeShopOrderManagerEnver, CoffeeShopFoundationEnver>;
}
```

## Consumed Services

### **From Foundation Service** (`coffee-shop-foundation`)

#### 1. Event Bus (`eventBus` + `eventSrc`)
- **Purpose**: Send order lifecycle events to other services
- **Usage**: Publish order creation, state changes, cancellations
- **Pattern**: Event-driven architecture for loose coupling

#### 2. Configuration Table (`configTableName`)
- **Purpose**: Runtime configuration management
- **Usage**: Feature flags, business rules, service parameters
- **Pattern**: Dynamic configuration without deployment

#### 3. Counter Table (`countTableName`)
- **Purpose**: Business metrics tracking
- **Usage**: Order counts, performance metrics, KPIs
- **Pattern**: Atomic operations for consistent counting

## ONDEMANDENV Concepts Demonstrated

### **Consumer Pattern**
This service showcases how to **consume dependencies** rather than publish them:
```typescript
// Dependency declared in contracts
const foundationCdk = owner.contracts.coffeeShopFoundationCdk.theOne;
this.eventBus = new OdmdCrossRefConsumer(this, 'eventBus', foundationCdk.eventBusSrc);
```

### **Dependency Injection**
ONDEMANDENV platform automatically:
- Resolves dependency versions based on contracts
- Injects connection details (ARNs, table names, etc.)
- Handles cross-account IAM permissions
- Manages deployment ordering

### **Independent Development**
- Service can be developed and tested independently
- On-demand environments include all dependencies
- Changes don't impact other services until contracts change

## Business Logic Implementation

### **Order Management Features**
- **Order Validation**: Business rule enforcement
- **Inventory Checks**: Real-time availability verification  
- **Pricing Calculation**: Dynamic pricing with promotions
- **Status Tracking**: Complete order lifecycle visibility

### **Event Publishing**
```typescript
// Example: Publishing order events
await eventBridge.putEvents({
    Entries: [{
        Source: 'coffee-shop.order-manager',
        DetailType: 'Order State Changed',
        Detail: JSON.stringify({
            orderId: order.id,
            status: 'CONFIRMED',
            timestamp: new Date().toISOString()
        })
    }]
});
```

### **Configuration Management**
```typescript
// Example: Dynamic configuration usage
const config = await dynamodb.getItem({
    TableName: configTableName,
    Key: { configKey: { S: 'order-timeout-minutes' } }
});
const timeoutMinutes = parseInt(config.Item?.value?.S || '30');
```

## Development Workflow

### **Local Development**
```bash
npm run build   # Compile TypeScript
npm run test    # Run unit tests
npm run watch   # Watch for changes
npx cdk synth   # Generate CloudFormation
```

### **Environment Management**

#### **Static Environments**
- **Master Branch**: Deploys to `workspace1` account automatically
- **Stable Dependencies**: Consumes foundation service from master branch

#### **Feature Development with On-Demand Cloning**
```bash
# Create feature environment with dependencies
git checkout -b feature/new-order-validation
git commit -m "feat: new validation logic

odmd: create@master"

# This creates:
# 1. Your order-manager service from feature branch
# 2. Foundation service dependencies (isolated copy)
# 3. Complete end-to-end environment for testing
```

#### **Dependency Management**
- **Automatic Resolution**: Platform resolves dependency versions
- **Isolated Testing**: Each clone gets its own dependency instances
- **Safe Development**: No impact on other developers or shared environments

## Service Integration Patterns

### **Event-Driven Communication**
```typescript
// Listen for events from other services
const rule = new events.Rule(this, 'OrderProcessorEvents', {
    eventPattern: {
        source: ['coffee-shop.order-processor'],
        detailType: ['Payment Processed', 'Fulfillment Complete']
    }
});

rule.addTarget(new targets.LambdaFunction(orderStatusHandler));
```

### **Shared State Management**
```typescript
// Update order counters atomically
await dynamodb.updateItem({
    TableName: countTableName,
    Key: { metric: { S: 'daily-orders' } },
    UpdateExpression: 'ADD #count :inc',
    ExpressionAttributeNames: { '#count': 'count' },
    ExpressionAttributeValues: { ':inc': { N: '1' } }
});
```

## Monitoring & Operations

### **Service Health**
- **Dependency Monitoring**: Foundation service availability
- **Business Metrics**: Order processing rates, success rates
- **Error Tracking**: Failed validations, timeout issues

### **Observability Integration**
- **CloudWatch Metrics**: Custom business metrics
- **X-Ray Tracing**: End-to-end request tracking
- **Structured Logging**: Correlated log events

## Testing Strategy

### **Unit Testing**
```bash
npm run test
# Tests business logic in isolation
# Mocks external dependencies
```

### **Integration Testing**
```bash
# Deploy to on-demand environment
odmd: create@master

# Run integration tests against real dependencies
npm run test:integration

# Cleanup when done
odmd: delete
```

### **Contract Testing**
- Verify dependency interfaces match contracts
- Ensure consumed services provide expected data formats
- Validate event schemas and patterns

## Getting Started

1. **Understand Dependencies**: Review the contract definition in [`contracts-sandbox`](../../contracts-sandbox/lib/repos/coffee-shop/coffee-shop-order-manager-cdk.ts)

2. **Explore Foundation**: Understand what services are provided by [`coffee-shop-foundation`](../coffee-shop--foundation)

3. **Compare with Processor**: See how similar patterns are used in [`coffee-shop-order-processor`](../coffee-shop--order-processor)

4. **Deploy & Test**:
   ```bash
   # Create development environment
   git commit -m "test: exploring order manager

   odmd: create@master"
   
   # Deploy and test
   npx cdk deploy
   ```

5. **Learn More**: Visit [ONDEMANDENV documentation](../ondemandenv.github.io) for platform concepts

## Key Benefits Demonstrated

- **Clear Dependencies**: Explicit contracts eliminate hidden coupling
- **Independent Development**: Full-stack environments for each feature branch
- **Platform Abstraction**: Focus on business logic, not infrastructure complexity  
- **Safe Experimentation**: Isolated environments prevent breaking shared resources
- **Automatic Dependency Management**: Platform handles connection details and permissions
- **Event-Driven Architecture**: Loose coupling through message passing

This service demonstrates how ONDEMANDENV enables **true microservice agility** - teams can develop independently while maintaining system coherence through explicit, code-driven contracts.
