# K8s Hands-on
Here a random introduction will find its place. Probably I will link the ppt in additon.
## Setup Kubernetes cluster on Azure
### Preparations
* Install Azure CLI if needed
[here](https://docs.microsoft.com/de-de/cli/azure/install-azure-cli?view=azure-cli-latest "https://docs.microsoft.com/de-de/cli/azure/install-azure-cli?view=azure-cli-latest")
* Install `az aks` if needed
```powershell
az aks install-cli
```
* Before you start check in which subscription you are working.
````powershell
az account list --refresh
````
* If needed set your CLI to a subscription.
```powershell
az account set --subscription <SUBSCRIPTION>
```
### Create Cluster
1. Create resource group
```powershell
az group create --name <RESOURCEGROUP> --location <LOCATION>
```
2. Create Azure Kubernetes Service
```powershell
az aks create \
    --resource-group <RESOURCEGROUP> \
    --name <CLUSTERNAME> \
    --node-count 1 \
    --enable-addons monitoring \
    --generate-ssh-keys
```
### Connect to cluster
1. Connect to cluster
```
az aks get-credentials --resource-group <RESOURCEGROUP> --name <CLUSTERNAME>
```
2. Check if connected
```
kubectl config get-contexts
```
3. Validate cluster connection
```powershell
kubectl get nodes
```
## Kubernetes 101 - incremental
### Deploy cached image
* Deploy `nginx` image.
```powershell
kubectl run nginx --image=nginx --replicas=1
```
* Check if deployed.
```powershell
kubectl get pods
```
* Create a tunnel while using port forwarding. You should the an nginx deployment when open `http//:localhost`
```powershell
kubectl port-forward <NAME_OF_POD> 80:80
```
* Check if there was a `deployment` created and start editing
```powershell
kubectl get deployment
```
```powershell
kubectl edit deployment <NAME_OF_DEPLOYMENT>
```
* In the deployment yaml it says `replicas: 1`. Delete the pod to see the self healing mechanism of kubernetes. To follow the whole process open another terminal and call `kubectl get pods -w`. This will stream any change.
```powershell
kubectl delete pod <NAME_OF_POD>
```
* The pod will be recreated immediately since the deployment says that there should be 1 replica at any time. This is a huge thing since Kubernetes will always look after the healthiness of you applications. That is why Kubernetes is `self healing`. 
```powershell
kubectl get pods
```
* Clean up and delete the deployment of the nginx.
```powershell
kubectl delete deployment nginx
```
## Kubernetes 101 - yaml
### Create Azure Container Registry
The Azure Container Registry (ACR) is a private image repository hosted on Azure.
* Create an ACR by using the azure cli. For simplicity, we set the `--admin-enabled` flag to true to push an image directly from our command line to the ACR.
```powershell
az acr create -n <REGISTRY_NAME> -g <RESOURCE_GROUP_NAME> --sku Standard --admin-enabled true --location <LOCATION>
```
### Prepare the Cluster
Next, we will deploy own images by using yaml files. In these yaml files we will link an ACR. To enable the AKS to access the ACR we can add the privileges to the existing Service Principal (SP) which was created during the cluster creation or, in case you do not have enough privileges to do so, we can create a Kubernetes secret. For simplicity we will use the SP which we already created. Review [this Microsoft Docs](https://docs.microsoft.com/de-de/azure/container-registry/container-registry-auth-aks "https://docs.microsoft.com/de-de/azure/container-registry/container-registry-auth-aks") to understand both ways.
* Replace the variables and run this powershell script to add the privileges to the existing SP.
```powershell
$AKS_RESOURCE_GROUP="<AKS_RESOURCE_GROUP>"
$AKS_CLUSTER_NAME="<AKS_CLUSTER_NAME>"
$ACR_RESOURCE_GROUP="<ACR_RESOURCE_GROUP>"
$ACR_NAME="ACR_NAME"
$CLIENT_ID=$(az aks show --resource-group $AKS_RESOURCE_GROUP --name $AKS_CLUSTER_NAME --query "servicePrincipalProfile.clientId" --output tsv)
$ACR_ID=$(az acr show --name $ACR_NAME --resource-group $ACR_RESOURCE_GROUP --query "id" --output tsv)
az role assignment create --assignee $CLIENT_ID --role acrpull --scope $ACR_ID
```
Go tot the Azure portal and validate if you can see a `role assignment` from the AKS's SP under the `Access control` of the ACR.
### Prepare the sample Node Application
Checkout the `js-idrepater` which is located in the GitHub repository.
* Run the docker build command. Tag the image with the application's name (`js-idrepeater`) and set a version number like `1`. Notice that we used the prefix `<ACR_NAME>.azurecr.io`. We need this prefix for the docker push command later.
```powershell
docker build -t <ACR_NAME>.azurecr.io/js-idrepeater:1 .
```
* Test `js-idrepeater` locally. Do not forget to forward the machines port to the container port.
```powershell
docker run -p 80:80 <ACR_NAME>.azurecr.io/js-idrepeater:1
```
* To validate that the application is running open a browser and call the localhost. You will see a random four digit key. This key is generated on start up of the container and will not change during the whole lifecycle of the container. To understand this behavior kill the container and run it once again.
```
http://localhost:80
```
* As we confirmed that the container is running we will push our image to our newly created ACR. First authenticate with the ACR.
```powershell
az acr login -n <ACR_NAME>
```
```powershell
docker push <ACR_NAME>.azurecr.io/js-idrepeater:1
```
* Verify the upload by check the console output and visit the ACR in the azure portal. Look for `Repositories` in the menu and check if a repository with `js-idrepeater` was created.
## Deploy the `js-idrepeater` to your AKS Cluster
* Let's create a kubernetes deployment yaml. In the source tree of `js-idrepeater` create a folder named `manifests`. Inside, create a file and call it `deployment.yml`. If you stick to the provides names of the folder and files Azure DevOps can read these files automatically in a later exercise of this workshop.
* Please consider, that you have to point to the correct version of you image within the ACR! For now you are good with taking `1`. Since we applied the privilges to access the ACR to the SP we are all good. If you are using a pull secret you have to specify it!
```yaml
apiVersion : apps/v1beta1
kind: Deployment
metadata:
  name: js-idrepeater 
spec:
  replicas: 2
  template:
    metadata:
      labels:
        app: js-idrepeater
    spec:
      containers:
        - name: js-idrepeater 
          image: <ACR_NAME>.azurecr.io/js-idrepeater:1
          ports:
          - containerPort: 80
```
* Now, apply the `Deployment` to your kubernetes cluster. (Hint: As we do not specify any namespace the namespace `default` is used)
```powershell
kubectl apply -f .\deployment.yml
```
* Check if the deployment created your pod.
```powershell
kubectl get pods
```
* Forward to this pod and call `http://localhost`.
```powershell
kubectl port-forward <NAME_OF_POD> 80:80
```
## Learn about kubernetes' service discovery
As you can see we have more than one js-idrepeater. You need an abstraction layer which knows every `Pod` no matter on which node it is running on. We are talking about a `Service`. A Service is identifying a pod by using `selectors`. Create the file `service.yml` next to the deployment.
 ```yaml
apiVersion: v1
kind: Service
metadata:
    name: js-idrepeater
spec:
    ports:
    - port: 80 
    selector:
        app: js-idrepeater
```
```powershell
kubectl apply -f .\service.yml
```
* Now all pods of js-idrepeater are reachable through the service. Check if the service is running.
```powershell
kubectl get svc
```
* Let us log on to one of the running pods and call the other one by using the service. Finally output the result.
```powershell
kubectl get pods
```
```powershell
kubectl exec -it <POD_NAME_NGINX> /bin/sh
```
```powershell
wget http://idrepeater
```
```powershell
cat index.html
```
### Using LoadBalancer to expose the service outside the cluster
* Edit the yaml of the service as follows. By default the type of a service is ClusterIp. We will change it to LoadBalancer. When you update the service with the new yaml file kubernetes will immediatly create a IP in Azure and connect it to your service directly. 
 ```yaml
apiVersion: v1
kind: Service
metadata:
    name: js-idrepeater
spec:
    ports:
    - port: 80 
    selector:
        app: js-idrepeater
    type: LoadBalancer
```
```powershell
kubectl apply -f .\service.yml
```
* It will take some time until the IP is scheduled.
```powershell
kubectl get svc -w
```